// Odeum プラグインの HTTP ルート (/api/x/odeum/*)。
//
// - GET  /status                     機能の有効/無効と理由
// - GET  /live                       ダッシュボード「いま発表中」カード
// - POST /sessions                   発表開始 (作成者/管理者) → odeum:// リンク
// - POST /sessions/:id/end           発表終了
// - POST /sessions/:id/viewer-ticket 視聴チケット (WebSocket 接続用)
// - GET  /sessions/:id/invitation   参加コード・参加 QR・OBS オーバーレイ URL (発表者/作成者/管理者)
// - GET  /ticket-pubkeys             中継の ODEUM_RELAY_TICKET_PUBKEYS 用 JSON (管理者)
//
// チケットとコメント本文はログに出さない。チケットに載せるのは Cernere user_id と表示名だけ。

import { Hono, getIdentity, getDisplayName, cacheDisplayName } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext } from '../../corpus/server/hub/sdk.ts';
import QRCode from 'qrcode';
import { z } from 'zod';
import { getEventStore, type EventRow } from '../events/store.ts';
import { canSee, parseAudience, resolveRoles } from '../roles/audience.ts';
import { noStore } from '../shared.ts';
import type { OdeumConfig } from './config.ts';
import { buildLiveCards, type LiveEventInfo } from './live-cards.ts';
import { canEndPresentation, canStartPresentation } from './permissions.ts';
import { fetchRelaySessions } from './relay-client.ts';
import {
  endOdeumSession,
  getOdeumSession,
  listLiveOdeumSessions,
  startOdeumSession,
} from './session-store.ts';
import {
  deriveInvitation,
  formatGuestCode,
  guestJoinUrl,
  invitationSecret,
  inviteClaim,
  overlayUrl,
  type OdeumInvitation,
} from './invitation.ts';
import { publicKeysDocument, signOdeumTicket, type TicketSigner } from './ticket.ts';

const PRESENTER_TICKET_TTL_SECONDS = 300;
const VIEWER_TICKET_TTL_SECONDS = 120;
const SERVICE_TICKET_TTL_SECONDS = 60;
const SERVICE_SUBJECT = 'glab-hub';

const startSchema = z.object({ eventId: z.number().int().positive() }).strict();

interface Viewer {
  userId: string;
  isAdmin: boolean;
  displayName: string | null;
}

/** 発表者アプリの起動リンク。 relay は WS(S) base、 ticket は presenter チケット。 */
export function presentUrl(wsBase: string, ticket: string): string {
  return `odeum://present?relay=${encodeURIComponent(wsBase)}&ticket=${encodeURIComponent(ticket)}`;
}

export function makeOdeumRoutes(ctx: CorpusContext, config: OdeumConfig): Hono {
  const routes = new Hono();

  const visible = (event: EventRow, viewer: Viewer): boolean => canSee(
    parseAudience(event.audience_roles),
    resolveRoles(ctx.db, viewer.userId),
    event.created_by === viewer.userId,
    viewer.isAdmin,
  );
  const nameOf = (viewer: Viewer): string =>
    viewer.displayName || getDisplayName(ctx.db, viewer.userId) || viewer.userId;
  const enabledSigner = (): TicketSigner | null =>
    config.disabledReason == null ? config.signer : null;
  const secret = config.signer ? invitationSecret(config.signer.privateKey) : null;
  const invitationFor = (sessionId: string): OdeumInvitation | null =>
    secret ? deriveInvitation(secret, sessionId) : null;

  routes.get('/status', (c) => {
    noStore(c);
    return c.json({ enabled: config.disabledReason == null, reason: config.disabledReason });
  });

  routes.get('/live', async (c) => {
    noStore(c);
    const viewer = getIdentity(c);
    const sessions = listLiveOdeumSessions(ctx.db);
    const events = new Map<number, LiveEventInfo>();
    const store = getEventStore();
    for (const eventId of new Set(sessions.map((session) => session.eventId))) {
      const event = await store.get(eventId);
      if (event) {
        events.set(eventId, { title: event.title, visible: visible(event, viewer), createdBy: event.created_by });
      }
    }
    // 中継へ届かなくてもカードは台帳から出す (relayState = unknown)。
    const signer = enabledSigner();
    const relay = sessions.length > 0 && signer && config.relay
      ? await fetchRelaySessions(
        config.relay.httpBase,
        signOdeumTicket(signer, { sub: SERVICE_SUBJECT, name: 'GLab-Hub', role: 'service' }, {
          ttlSeconds: SERVICE_TICKET_TTL_SECONDS,
        }).token,
      )
      : null;
    return c.json({
      enabled: config.disabledReason == null,
      relayReachable: relay != null,
      sessions: buildLiveCards(sessions, events, relay, viewer, (userId) => getDisplayName(ctx.db, userId)),
    });
  });

  routes.post('/sessions', async (c) => {
    noStore(c);
    const signer = enabledSigner();
    if (!signer || !config.relay) return c.json({ error: 'odeum_disabled', reason: config.disabledReason }, 503);
    const viewer = getIdentity(c);
    const parsed = startSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_session' }, 400);
    const event = await getEventStore().get(parsed.data.eventId);
    if (!event || !visible(event, viewer)) return c.json({ error: 'event_not_found' }, 404);
    if (!canStartPresentation(event, viewer)) return c.json({ error: 'forbidden' }, 403);

    const started = startOdeumSession(ctx.db, { eventId: event.id, presenterUserId: viewer.userId });
    if (started.kind === 'conflict') return c.json({ error: 'session_already_live' }, 409);
    if (viewer.displayName) cacheDisplayName(ctx.db, viewer.userId, viewer.displayName);
    const invitation = invitationFor(started.session.id);
    const ticket = signOdeumTicket(signer, {
      sub: viewer.userId,
      name: nameOf(viewer),
      role: 'presenter',
      sid: started.session.id,
      ...(invitation ? { invite: inviteClaim(invitation) } : {}),
    }, { ttlSeconds: PRESENTER_TICKET_TTL_SECONDS });
    ctx.logger.info(`odeum session ${started.kind}: ${started.session.id} (event ${event.id})`);
    return c.json({
      session: started.session,
      resumed: started.kind === 'resumed',
      presentUrl: presentUrl(config.relay.wsBase, ticket.token),
      expiresAt: ticket.claims.exp * 1000,
    }, started.kind === 'created' ? 201 : 200);
  });

  routes.post('/sessions/:id/end', async (c) => {
    noStore(c);
    const viewer = getIdentity(c);
    const session = getOdeumSession(ctx.db, c.req.param('id'));
    if (!session) return c.json({ error: 'not_found' }, 404);
    const event = await getEventStore().get(session.eventId);
    if (!canEndPresentation(session, event, viewer)) return c.json({ error: 'forbidden' }, 403);
    const ended = endOdeumSession(ctx.db, session.id);
    if (ended) ctx.logger.info(`odeum session ended: ${session.id}`);
    return c.json({ ok: true, alreadyEnded: !ended });
  });

  routes.post('/sessions/:id/viewer-ticket', async (c) => {
    noStore(c);
    const signer = enabledSigner();
    if (!signer || !config.relay) return c.json({ error: 'odeum_disabled', reason: config.disabledReason }, 503);
    const viewer = getIdentity(c);
    const session = getOdeumSession(ctx.db, c.req.param('id'));
    if (!session || session.status !== 'live') return c.json({ error: 'session_not_live' }, 404);
    const event = await getEventStore().get(session.eventId);
    if (!event || !visible(event, viewer)) return c.json({ error: 'session_not_live' }, 404);
    const name = nameOf(viewer);
    const ticket = signOdeumTicket(signer, {
      sub: viewer.userId,
      name,
      role: 'viewer',
      sid: session.id,
    }, { ttlSeconds: VIEWER_TICKET_TTL_SECONDS });
    return c.json({
      wsUrl: new URL('v1/ws', config.relay.wsBase).toString(),
      ticket: ticket.token,
      expiresAt: ticket.claims.exp * 1000,
      eventTitle: event.title,
      self: { sub: viewer.userId, name: ticket.claims.name },
    });
  });

  routes.get('/sessions/:id/invitation', async (c) => {
    noStore(c);
    const signer = enabledSigner();
    if (!signer || !config.invitationBases) {
      return c.json({ error: 'odeum_disabled', reason: config.disabledReason ?? 'invitation_base_invalid' }, 503);
    }
    const viewer = getIdentity(c);
    const session = getOdeumSession(ctx.db, c.req.param('id'));
    if (!session || session.status !== 'live') return c.json({ error: 'session_not_live' }, 404);
    const event = await getEventStore().get(session.eventId);
    // 招待は発表の運営者だけが見る (終了できる人と同じ範囲)。
    if (!canEndPresentation(session, event, viewer)) return c.json({ error: 'forbidden' }, 403);
    const invitation = invitationFor(session.id)!;
    const joinUrl = guestJoinUrl(config.invitationBases.guest, invitation.guestCode);
    return c.json({
      joinCode: formatGuestCode(invitation.guestCode),
      joinUrl,
      joinQr: await QRCode.toDataURL(joinUrl, { errorCorrectionLevel: 'M', margin: 2, width: 320 }),
      overlayUrl: overlayUrl(config.invitationBases.overlay, invitation.overlayKey),
    });
  });

  routes.get('/ticket-pubkeys', (c) => {
    noStore(c);
    if (!getIdentity(c).isAdmin) return c.json({ error: 'forbidden' }, 403);
    if (!config.signer) return c.json({ error: 'odeum_disabled', reason: config.disabledReason }, 503);
    return c.json(publicKeysDocument(config.signer));
  });

  return routes;
}
