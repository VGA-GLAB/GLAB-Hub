import {
  Hono,
  getDisplayName,
  getIdentity,
  requireAdmin,
} from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusDb, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import {
  ATTENDANCE_STATUSES,
  ensureGlabUser,
  ensureSchema,
  listGlabUsers,
  markAttendanceForEvent,
  setAttendanceStatus,
  type GlabUserRow,
} from '../data.ts';
import { getEventStore } from '../events/store.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { authorizedConnectorFetch } from '../shared.ts';
import { ostiariusBrowserBaseUrl } from './ostiarius-health.ts';

const attendanceInputSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
}).strict();

const checkinInputSchema = z.object({
  attestation: z.string().min(1),
}).strict();

async function attendanceView(db: CorpusDb, row: GlabUserRow): Promise<Record<string, unknown>> {
  const event = row.attendance_event_id == null
    ? null
    : await getEventStore().get(row.attendance_event_id);
  return {
    userId: row.user_id,
    displayName: getDisplayName(db, row.user_id),
    status: row.attendance_status,
    eventId: event?.id ?? null,
    eventTitle: event?.title ?? null,
    checkedInAt: row.attendance_checked_in_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

async function activeEventView(): Promise<Record<string, unknown> | null> {
  const event = await getEventStore().findActive();
  if (!event) return null;
  return {
    id: event.id,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    facilityId: event.facility_id,
  };
}

function passthrough(response: Response, body: string): Response {
  return new Response(body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') ?? 'application/json' },
  });
}

function makeRoutes(
  ctx: CorpusContext,
  ostiarius: VersionedHttpServiceConnector,
  aedilis: VersionedHttpServiceConnector,
): Hono {
  const db = ctx.db;
  const router = new Hono();

  router.get('/availability', async (c) => {
    const event = await activeEventView();
    const osProbe = await ostiarius.probe();
    const osHealth = osProbe.health;
    return c.json({
      enabled: event != null && osHealth.status === 'up',
      event,
      ostiarius: {
        status: osHealth.status,
        detail: osHealth.detail,
        baseUrl: ostiariusBrowserBaseUrl(osProbe.payload),
      },
    });
  });

  router.post('/checkin', async (c) => {
    const parsed = checkinInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'attestation_required' }, 400);
    const event = await getEventStore().findActive();
    if (!event) return c.json({ error: 'no_active_event' }, 409);
    const osHealth = await ostiarius.health();
    if (osHealth.status !== 'up') return c.json({ error: 'ostiarius_unavailable' }, 503);

    // attestation の検証は Aedilis /api/checkin/verify に委ねる。ユーザトークンを
    // 転送することで Aedilis 側が本人性 (payload.sub)・署名・鮮度・リプレイを検証する。
    let verified: Response;
    try {
      verified = await authorizedConnectorFetch(
        c,
        aedilis,
        '/api/checkin/verify',
        ctx.tokenProvider,
        'aedilis',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
    } catch {
      return c.json({ error: 'aedilis_unavailable' }, 502);
    }
    const verifiedBody = await verified.text();
    if (!verified.ok) return passthrough(verified, verifiedBody);

    const identity = getIdentity(c);
    const attendance = markAttendanceForEvent(db, identity.userId, event.id);
    return c.json({
      ok: true,
      user: await attendanceView(db, attendance),
      event: await activeEventView(),
    });
  });

  router.get('/mine', async (c) => {
    const identity = getIdentity(c);
    return c.json({ user: await attendanceView(db, ensureGlabUser(db, identity.userId)) });
  });

  router.get('/list', requireAdmin, async (c) => {
    return c.json({ users: await Promise.all(
      listGlabUsers(db).map((row) => attendanceView(db, row)),
    ) });
  });

  router.put('/:userId/status', requireAdmin, async (c) => {
    const parsed = attendanceInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_attendance_status' }, 400);
    const actor = getIdentity(c);
    const updated = setAttendanceStatus(
      db,
      c.req.param('userId'),
      parsed.data.status,
      actor.userId,
    );
    if (!updated) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true, user: await attendanceView(db, updated) });
  });

  return router;
}

const attendanceModule: CorpusModule = {
  id: 'attendance',
  title: '出席',
  icon: '✅',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const ostiarius = new VersionedHttpServiceConnector({
      id: 'ostiarius',
      title: 'Wi-Fi内出席 (Ostiarius / Os)',
      scope: 'local',
      baseUrl: ctx.env('OSTIARIUS_URL') ?? '',
      healthPath: '/api/health',
    });
    ctx.registerConnector(ostiarius);
    // attestation 検証先。connector 登録は facility モジュールの 'aedilis' と重複するため行わない。
    const aedilis = new VersionedHttpServiceConnector({
      id: 'aedilis',
      title: '施設予約 (Aedilis)',
      scope: 'multi',
      baseUrl: ctx.env('AEDILIS_BASE_URL') ?? '',
      healthPath: '/api/health',
    });
    ctx.registerRoute(makeRoutes(ctx, ostiarius, aedilis));
    ctx.registerPanel({ title: '出席', icon: '✅' });
    ctx.logger.info('attendance ready (active event + Ostiarius passkey + Aedilis verify)');
  },
};

export default attendanceModule;
