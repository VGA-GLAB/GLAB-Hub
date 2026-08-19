import {
  Hono,
  getDisplayName,
  getIdentity,
  requireAdmin,
} from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusDb, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import {
  attendanceSummary,
  dateInJst,
  ensureSchema,
  findGateway,
  listAttendance,
  recordAttendance,
  reserveAttendanceNonce,
  type AttendanceRow,
} from '../data.ts';
import { getEventStore, type EventRow } from '../events/store.ts';
import type { EventOccurrence } from '../events/recurrence.ts';
import { canSee, parseAudience, resolveRoles } from '../roles/audience.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { verifyAttestation } from './attestation-verify.ts';
import { refreshGatewayPublicKey } from './gateway-register.ts';
import { ostiariusBrowserBaseUrl } from './ostiarius-health.ts';

const CHECKIN_FRESHNESS_MS = 120_000;
const RECENT_ATTENDANCE_DAYS = 30;
// 1 日分の台帳は GLAB の在籍規模を十分に上回る上限で返す (既定の 100 だと
// 出席の多い日に管理者一覧が黙って切り捨てられる)。 集計は /summary を使う。
const ADMIN_LIST_LIMIT = 1_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const checkinInputSchema = z.object({ attestation: z.string().min(1) }).strict();
const manualInputSchema = z.object({
  userId: z.string().trim().min(1),
  date: z.string().regex(DATE_PATTERN),
  facilityId: z.string().trim().min(1),
}).strict();

/**
 * 台帳行をまとめて view 化する。 イベントは Postgres 越しの参照なので、 行ごとに
 * 引かず重複を除いた event_id 単位で 1 回だけ取得する。 イベント紐付けの無い台帳は
 * イベントストア自体に触れない (未初期化でも履歴は読める)。
 */
async function attendanceViews(
  db: CorpusDb,
  rows: AttendanceRow[],
): Promise<Array<Record<string, unknown>>> {
  const eventIds = [...new Set(
    rows.map((row) => row.event_id).filter((id): id is number => id != null),
  )];
  const events = new Map<number, EventRow>();
  if (eventIds.length > 0) {
    const store = getEventStore();
    const fetched = await Promise.all(eventIds.map((id) => store.get(id)));
    for (const event of fetched) if (event != null) events.set(event.id, event);
  }
  return rows.map((row) => attendanceView(
    db,
    row,
    row.event_id == null ? null : events.get(row.event_id) ?? null,
  ));
}

function attendanceView(db: CorpusDb, row: AttendanceRow, event: EventRow | null): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: getDisplayName(db, row.user_id),
    date: row.date,
    facilityId: row.facility_id,
    checkedInAt: row.checked_in_at,
    source: row.source,
    assurance: row.assurance,
    eventId: event?.id ?? null,
    eventTitle: event?.title ?? null,
  };
}

/**
 * 開催中イベントのうち、 閲覧者に見せてよいものだけを返す。
 * 役職限定イベントの判定は GET /events と同じ規則 (作成者 / admin / 対象役職)。
 */
async function visibleActiveEvent(
  db: CorpusDb,
  viewer: { userId: string; isAdmin: boolean },
): Promise<EventOccurrence | null> {
  const event = await getEventStore().findActive();
  if (!event) return null;
  const allowed = canSee(
    parseAudience(event.audience_roles),
    resolveRoles(db, viewer.userId),
    event.created_by === viewer.userId,
    viewer.isAdmin,
  );
  return allowed ? event : null;
}

function eventView(event: EventOccurrence | null): Record<string, unknown> | null {
  if (!event) return null;
  return {
    id: event.id,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    facilityId: event.facility_id,
  };
}

async function activeEventView(
  db: CorpusDb,
  viewer: { userId: string; isAdmin: boolean },
): Promise<Record<string, unknown> | null> {
  return eventView(await visibleActiveEvent(db, viewer));
}

export function makeRoutes(ctx: CorpusContext, ostiarius: VersionedHttpServiceConnector): Hono {
  const db = ctx.db;
  const router = new Hono();

  router.get('/availability', async (c) => {
    const event = await activeEventView(db, getIdentity(c));
    const osProbe = await ostiarius.probe();
    return c.json({
      enabled: event != null && osProbe.health.status === 'up',
      event,
      ostiarius: {
        status: osProbe.health.status,
        detail: osProbe.health.detail,
        baseUrl: ostiariusBrowserBaseUrl(osProbe.payload),
      },
    });
  });

  router.post('/checkin', async (c) => {
    const parsed = checkinInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'attestation_required' }, 400);
    // attestation を自前検証するので Ostiarius の health は見ない (公開鍵は
    // glab_gateway にキャッシュ済みで、 会場 LAN が落ちていても検証は成立する)。
    const verified = verifyAttestation(parsed.data.attestation, {
      findGateway: (lanId) => {
        const gateway = findGateway(db, lanId);
        return gateway && {
          lanId: gateway.lan_id,
          facilityId: gateway.facility_id,
          publicKeyPem: gateway.public_key_pem,
        };
      },
      now: Date.now,
      freshnessMs: CHECKIN_FRESHNESS_MS,
    });
    if (!verified.ok) return c.json({ error: verified.reason }, 400);

    const identity = getIdentity(c);
    if (verified.payload.sub !== identity.userId) return c.json({ error: 'subject_mismatch' }, 403);
    if (!reserveAttendanceNonce(db, verified.payload.nonce)) {
      return c.json({ error: 'replay_detected' }, 409);
    }

    // 出席そのものはイベントに依存しない。 進行中イベントがあれば紐付けるだけで、
    // 役職限定で「見えない」イベントは紐付けない (出席は成立させる)。 イベントストア
    // (Postgres) が引けない場合も紐付けを諦めるだけで、 出席記録は必ず成立させる。
    const event = await visibleActiveEvent(db, identity).catch(() => null);
    const created = recordAttendance(db, {
      userId: identity.userId,
      date: dateInJst(verified.payload.issuedAt),
      facilityId: verified.payload.placeId,
      checkedInAt: verified.payload.issuedAt,
      // 実際に通った経路をそのまま台帳へ。 method を持たない旧 attestation だけ
      // 従来どおり passkey として記録する (遡って書き換えはしない)。
      source: verified.payload.method ?? 'passkey',
      assurance: verified.payload.assurance ?? null,
      eventId: event?.id ?? null,
      detail: { lanId: verified.payload.lanId },
    });
    if (!created) return c.json({ ok: true, alreadyCheckedIn: true });
    // 記録後にイベントを引き直さない — ここで失敗すると台帳に書けたのに 500 を返す。
    return c.json({ ok: true, alreadyCheckedIn: false, event: eventView(event) });
  });

  router.get('/mine', async (c) => {
    const identity = getIdentity(c);
    const now = Date.now();
    const rows = listAttendance(db, {
      userId: identity.userId,
      from: dateInJst(now - (RECENT_ATTENDANCE_DAYS - 1) * 86_400_000),
      to: dateInJst(now),
    });
    return c.json({ attendance: await attendanceViews(db, rows) });
  });

  router.get('/list', requireAdmin, async (c) => {
    const rows = listAttendance(db, {
      date: c.req.query('date'),
      facilityId: c.req.query('facilityId'),
      limit: ADMIN_LIST_LIMIT,
    });
    return c.json({ attendance: await attendanceViews(db, rows) });
  });

  router.get('/summary', requireAdmin, (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!from || !to) return c.json({ error: 'date_range_required' }, 400);
    if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
      return c.json({ error: 'invalid_date_range' }, 400);
    }
    return c.json({ summary: attendanceSummary(db, from, to) });
  });

  router.post('/manual', requireAdmin, async (c) => {
    const parsed = manualInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_manual_attendance' }, 400);
    const actor = getIdentity(c);
    const created = recordAttendance(db, {
      ...parsed.data,
      checkedInAt: Date.now(),
      source: 'manual',
      detail: { adminUserId: actor.userId },
    });
    return c.json({ ok: true, alreadyCheckedIn: !created });
  });

  return router;
}

const attendanceModule: CorpusModule = {
  id: 'attendance',
  title: '出席',
  icon: '✅',
  async setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const ostiarius = new VersionedHttpServiceConnector({
      id: 'ostiarius',
      title: 'Wi-Fi内出席 (Ostiarius / Os)',
      scope: 'local',
      baseUrl: ctx.env('OSTIARIUS_URL') ?? '',
      healthPath: '/api/health',
    });
    ctx.registerConnector(ostiarius);
    try {
      const refreshed = await refreshGatewayPublicKey(ctx.db, ostiarius);
      if (!refreshed) ctx.logger.error('attendance gateway public key was not refreshed; cached keys remain in use');
    } catch (error) {
      ctx.logger.error(`attendance gateway key refresh failed; cached keys remain in use: ${error instanceof Error ? error.message : String(error)}`);
    }
    ctx.registerRoute(makeRoutes(ctx, ostiarius));
    ctx.registerPanel({ title: '出席', icon: '✅' });
    ctx.logger.info('attendance ready (local Ed25519 attestation verification + ledger)');
  },
};

export default attendanceModule;
