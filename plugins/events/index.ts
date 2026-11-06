// GLAB モジュール 3: イベント (events)。
// イベントと施設マスタの正本は GLAB PostgreSQL。Aedilis の施設一覧は未登録施設の
// 候補にだけ使い、イベント作成・削除時に対応する予約を Aedilis へ同期する。

import { Hono, getIdentity, cacheDisplayName } from '../../corpus/server/hub/sdk.ts';
import type { CorpusModule, CorpusContext, ServiceConnector } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { EventOwnerRejected, getEventStore, type EventRow } from './store.ts';
import { canSee, resolveRoles, parseAudience as audience } from '../roles/audience.ts';
import { getFacilityStore, type GlabFacility } from './facility-store.ts';
import { makeAedilisConnector } from '../shared.ts';
import {
  AedilisEventClient,
  AedilisRequestError,
  type AedilisFacilityCandidate,
} from './aedilis-client.ts';
import { ORGANIZATION_ID, isMeetUrl, issueEventMeet, meetOrganizations } from './meet-client.ts';
import { cancelMeetingEvent } from '../facility/meeting-event.ts';
import { registerEventAttendance } from './attendance-routes.ts';
import { BookingActorUnavailable } from '../facility/booking-actor.ts';
import { currentEventOwner, type EventRequestOwner } from './request-owner.ts';

const eventInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().max(4_000).optional(),
  startsAt: z.union([z.string(), z.number()]),
  endsAt: z.union([z.string(), z.number()]),
  facilityId: z.string().trim().max(255).optional(),
  audienceRoles: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,62}$/)).max(20).default([]),
  recurrence: z.enum(['none', 'weekly']).default('none'),
  // 作成と同時に Google Meet のリンクを発行する。組織を選ぶとその組織の代表アカウントで作る。
  meet: z.boolean().default(false),
  meetOrganizationId: z.string().regex(ORGANIZATION_ID).optional(),
}).strict();

const meetInputSchema = z.object({
  organizationId: z.string().regex(ORGANIZATION_ID).optional(),
}).strict();

/** `from`〜`to` に許す最大幅 (週次イベントの occurrence 展開量の上限)。 */
const MAX_EVENT_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;
export type AedilisEventRequests = Pick<AedilisEventClient, 'listFacilities' | 'createReservation' | 'cancelReservation'>;

function eventView(row: EventRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    facilityId: row.facility_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    notified: row.notified_at != null,
    audienceRoles: audience(row.audience_roles) ?? [],
    recurrence: row.recurrence,
    occurrenceDate: row.occurrence_date ?? null,
    meetUrl: isMeetUrl(row.meet_url) ? row.meet_url : null,
    fromMeeting: !!row.meeting_id,
  };
}

function timestamp(value: string | number): number {
  return typeof value === 'string' ? Date.parse(value) : value;
}

function facilityView(facility: GlabFacility): Record<string, unknown> {
  return { id: facility.id, displayName: facility.displayName };
}

function candidateView(candidate: AedilisFacilityCandidate): Record<string, unknown> {
  return { id: candidate.id, displayName: candidate.name, location: candidate.location };
}

async function resolveFacility(
  c: Parameters<AedilisEventClient['listFacilities']>[0],
  client: AedilisEventRequests,
  facilityId: string,
  facilities: Pick<ReturnType<typeof getFacilityStore>, 'get' | 'promote'>,
  actor: EventRequestOwner,
): Promise<GlabFacility | null> {
  const existing = await facilities.get(facilityId);
  actor.assertCurrent();
  if (existing) return existing;
  const candidate = (await client.listFacilities(c)).find((item) => item.id === facilityId);
  actor.assertCurrent();
  if (!candidate) return null;
  return facilities.promote({
    id: candidate.id,
    displayName: candidate.name,
    aedilisFacilityId: candidate.id,
  });
}

function aedilisFailure(error: AedilisRequestError): Response {
  const status = error.status === 409 ? 409 : 502;
  return Response.json({
    error: 'aedilis_reservation_failed',
    downstreamStatus: error.status,
    code: /^[a-z][a-z0-9_]{0,63}$/.test(error.code) ? error.code : 'request_unconfirmed',
    retryable: false,
  }, { status });
}

export interface EventRouteStores {
  events: () => Pick<ReturnType<typeof getEventStore>, 'get' | 'list' | 'create' | 'setMeetUrl' | 'delete'>;
  facilities: () => Pick<ReturnType<typeof getFacilityStore>, 'get' | 'list' | 'promote'>;
}
export function makeRoutes(ctx: CorpusContext, aedilis: AedilisEventRequests, connector: ServiceConnector,
  stores: EventRouteStores = { events: getEventStore, facilities: getFacilityStore }): Hono {
  // Borrow the existing startup-owned stores. Tests supply bounded stores, never
  // new connections, fallback state or a second owner of the production pool.
  const events = stores.events(), facilities = stores.facilities();
  const routes = new Hono();
  routes.use('*', async (c, next) => { c.header('cache-control', 'private, no-store'); await next(); });
  routes.onError((error, c) => {
    if (error instanceof BookingActorUnavailable) return c.json({ error: 'current_booking_actor_unconfirmed', retryable: false }, 403);
    if (error instanceof EventOwnerRejected) return c.json({ error: error.code, retryable: false }, error.code === 'not_found' ? 404 : 403);
    return c.json({ error: 'event_operation_unconfirmed', retryable: false }, 503);
  });
  registerEventAttendance(routes, ctx, id => events.get(id));

  routes.get('/facilities', async (c) => {
    const actor = currentEventOwner(c);
    const master = await facilities.list();
    actor.assertCurrent();
    try {
      const knownIds = new Set(master.map((item) => item.aedilisFacilityId));
      const suggestions = (await aedilis.listFacilities(c))
        .filter((item) => !knownIds.has(item.id));
      actor.assertCurrent();
      return c.json({
        items: master.map(facilityView),
        suggestions: suggestions.map(candidateView),
        aedilisAvailable: true,
      });
    } catch (error) {
      actor.assertCurrent();
      return c.json({
        items: master.map(facilityView),
        suggestions: [],
        aedilisAvailable: false,
        downstreamStatus: error instanceof AedilisRequestError ? error.status : 502,
      });
    }
  });

  // Current own membership only; an unknown lookup cannot be a successful empty result.
  routes.get('/meet/organizations', async (c) => {
    const actor = currentEventOwner(c);
    try {
      const items = await meetOrganizations(c, ctx);
      actor.assertCurrent();
      return c.json({ items });
    } catch {
      actor.assertCurrent();
      return c.json({ error: 'event_organizations_unavailable', available: false, retryable: false }, 503);
    }
  });

  routes.get('/events', async (c) => {
    const identity = getIdentity(c);
    const actor = currentEventOwner(c);
    const includePast = c.req.query('all') === '1';
    const from = c.req.query('from');
    const to = c.req.query('to');
    const fromAt = from == null ? undefined : Date.parse(from);
    const toAt = to == null ? undefined : Date.parse(to);
    if ((fromAt != null && !Number.isFinite(fromAt)) || (toAt != null && !Number.isFinite(toAt))) {
      return c.json({ error: 'invalid_event_range' }, 400);
    }
    // 週次イベントは期間ぶんだけ occurrence を展開するので、 期間を無制限に
    // 広げられると 1 リクエストで際限なく展開されてしまう。
    const rangeFrom = fromAt ?? Date.now();
    if (toAt != null && (toAt <= rangeFrom || toAt - rangeFrom > MAX_EVENT_RANGE_MS)) {
      return c.json({ error: 'invalid_event_range' }, 400);
    }
    const rows = await events.list({ includePast, from: fromAt, to: toAt });
    actor.assertCurrent();
    // The PostgreSQL read yields; use current roles when projecting private rows.
    const roles = resolveRoles(ctx.db, identity.userId);
    return c.json({
      events: rows
        .filter((event) => canSee(audience(event.audience_roles), roles, event.created_by === identity.userId, identity.isAdmin))
        .map(eventView),
    });
  });

  routes.post('/events', async (c) => {
    const identity = getIdentity(c);
    const actor = currentEventOwner(c);
    const parsed = eventInputSchema.safeParse(await c.req.json().catch(() => null));
    actor.assertCurrent();
    if (!parsed.success) return c.json({ error: 'invalid_event' }, 400);
    const startsAt = timestamp(parsed.data.startsAt);
    const endsAt = timestamp(parsed.data.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
      return c.json({ error: 'invalid_event_period' }, 400);
    }

    // 施設は任意。 指定された場合のみ Aedilis で解決し、 施設予約を作成する。
    const facilityIdInput = parsed.data.facilityId?.trim();
    let facility: GlabFacility | null = null;
    let reservationId: string | null = null;
    if (facilityIdInput) {
      try {
        facility = await resolveFacility(c, aedilis, facilityIdInput, facilities, actor);
      } catch (error) {
        if (error instanceof BookingActorUnavailable) throw error;
        return error instanceof AedilisRequestError
          ? aedilisFailure(error)
          : c.json({ error: 'facility_lookup_failed' }, 502);
      }
      if (!facility) return c.json({ error: 'facility_not_found' }, 400);

      try {
        actor.assertCurrent();
        reservationId = await aedilis.createReservation(c, {
          facilityId: facility.aedilisFacilityId,
          startsAt,
          endsAt,
          purpose: parsed.data.title,
        });
        actor.assertCurrent();
      } catch (error) {
        if (error instanceof BookingActorUnavailable) throw error;
        return error instanceof AedilisRequestError
          ? aedilisFailure(error)
          : c.json({ error: 'aedilis_reservation_failed' }, 502);
      }
    }

    let eventId: number;
    try {
      actor.assertCurrent();
      eventId = await events.create({
        title: parsed.data.title,
        body: parsed.data.body?.trim() || null,
        location: facility?.displayName ?? null,
        startsAt,
        endsAt,
        facilityId: facility?.id ?? null,
        reservationId,
        createdBy: identity.userId,
        audienceRoles: parsed.data.audienceRoles,
        recurrence: parsed.data.recurrence,
      }, actor.assertCurrent);
    } catch (error) {
      if (error instanceof BookingActorUnavailable) throw error;
      // A PostgreSQL commit acknowledgment can be lost. Automatically cancelling
      // the reservation here could break an event which actually committed.
      return c.json({ error: 'event_creation_result_unconfirmed', retryable: false }, 503);
    }
    actor.assertCurrent();
    if (identity.displayName) cacheDisplayName(ctx.db, identity.userId, identity.displayName);
    // Meet の発行に失敗してもイベントは残す (一覧の「Meet リンクを発行」から再発行できる)。
    let meetError: string | null = null;
    if (parsed.data.meet) {
      const meet = await issueEventMeet(c, ctx, connector, eventId, parsed.data.meetOrganizationId ?? null);
      actor.assertCurrent();
      if ('url' in meet) await events.setMeetUrl(eventId, meet.url, actor);
      else meetError = meet.error;
    }
    const created = await events.get(eventId);
    actor.assertCurrent();
    if (!created) return c.json({ error: 'event_creation_result_unconfirmed', retryable: false }, 503);
    actor.assertOwner(created);
    return c.json({ ok: true, event: created ? eventView(created) : null, ...(meetError ? { meetError } : {}) });
  });

  routes.post('/events/:id/meet', async (c) => {
    const actor = currentEventOwner(c);
    const eventId = Number(c.req.param('id'));
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
      return c.json({ error: 'invalid_event_id' }, 400);
    }
    const parsed = meetInputSchema.safeParse(await c.req.json().catch(() => null));
    actor.assertCurrent();
    if (!parsed.success) return c.json({ error: 'invalid_meet' }, 400);
    const event = await events.get(eventId);
    actor.assertCurrent();
    if (!event) return c.json({ error: 'not_found' }, 404);
    // 削除と同じく登録者と管理者だけ。
    actor.assertOwner(event);
    if (isMeetUrl(event.meet_url)) return c.json({ ok: true, meetUrl: event.meet_url });
    const meet = await issueEventMeet(c, ctx, connector, eventId, parsed.data.organizationId ?? null);
    actor.assertCurrent();
    if (!('url' in meet)) return c.json({ error: meet.error }, 502);
    await events.setMeetUrl(eventId, meet.url, actor);
    actor.assertCurrent();
    return c.json({ ok: true, meetUrl: meet.url });
  });

  routes.delete('/events/:id', async (c) => {
    const actor = currentEventOwner(c);
    const eventId = Number(c.req.param('id'));
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
      return c.json({ error: 'invalid_event_id' }, 400);
    }
    const event = await events.get(eventId);
    actor.assertCurrent();
    if (!event) return c.json({ error: 'not_found' }, 404);
    actor.assertOwner(event);
    let aedilisCancelFailed = false;
    if (event.meeting_id) {
      // Ae's meeting owner must cancel the handed-off reservation; never force-delete one side.
      const cancelled = await cancelMeetingEvent(c, ctx, connector, event.meeting_id);
      actor.assertCurrent();
      if (!cancelled.ok) return cancelled;
    } else if (event.reservation_id) {
      try {
        await aedilis.cancelReservation(c, event.reservation_id);
        actor.assertCurrent();
      } catch (error) {
        actor.assertCurrent();
        // 404 = Aedilis 側で既にキャンセル済み。それ以外は ?force=1 (削除権限と同一の
        // 登録者/admin) でのみローカル削除を強行できる — 恒久的に削除不能な残骸を作らない。
        const alreadyCancelled = error instanceof AedilisRequestError && error.status === 404;
        if (!alreadyCancelled && c.req.query('force') !== '1') {
          return error instanceof AedilisRequestError
            ? aedilisFailure(error)
            : c.json({ error: 'aedilis_cancellation_failed', forceAvailable: true }, 502);
        }
        aedilisCancelFailed = !alreadyCancelled;
      }
    }
    const current = await events.get(eventId);
    actor.assertCurrent();
    if (!current) return c.json({ error: 'not_found' }, 404);
    actor.assertOwner(current);
    if (current.meeting_id !== event.meeting_id || current.reservation_id !== event.reservation_id) return c.json({ error: 'event_changed', retryable: false }, 409);
    await events.delete(eventId, actor);
    actor.assertCurrent();
    return c.json({ ok: true, aedilisCancelFailed });
  });

  return routes;
}

const eventsModule: CorpusModule = {
  id: 'events',
  title: 'イベント',
  icon: '📅',
  async setup(ctx: CorpusContext) {
    // registerConnector は facility 側の 1 箇所だけ (重複登録しない)。
    const connector = makeAedilisConnector(ctx.env);
    const aedilis = new AedilisEventClient(connector, ctx.tokenProvider);
    ctx.registerRoute(makeRoutes(ctx, aedilis, connector));
    ctx.registerPanel({ title: 'イベント', icon: '📅' });
    ctx.logger.info('events ready (GLAB PostgreSQL + Aedilis reservations)');
  },
};

export default eventsModule;
