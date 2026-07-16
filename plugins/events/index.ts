// GLAB モジュール 3: イベント (events)。
// イベントと施設マスタの正本は GLAB PostgreSQL。Aedilis の施設一覧は未登録施設の
// 候補にだけ使い、イベント作成・削除時に対応する予約を Aedilis へ同期する。

import { Hono, getIdentity, cacheDisplayName } from '../../corpus/server/hub/sdk.ts';
import type { CorpusModule, CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { getEventStore, type EventRow } from './store.ts';
import { getFacilityStore, type GlabFacility } from './facility-store.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import {
  AedilisEventClient,
  AedilisRequestError,
  type AedilisFacilityCandidate,
} from './aedilis-client.ts';

const eventInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().max(4_000).optional(),
  startsAt: z.union([z.string(), z.number()]),
  endsAt: z.union([z.string(), z.number()]),
  facilityId: z.string().trim().min(1).max(255),
}).strict();

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
  client: AedilisEventClient,
  facilityId: string,
): Promise<GlabFacility | null> {
  const facilities = getFacilityStore();
  const existing = await facilities.get(facilityId);
  if (existing) return existing;
  const candidate = (await client.listFacilities(c)).find((item) => item.id === facilityId);
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
    code: error.code,
  }, { status });
}

export function makeRoutes(ctx: CorpusContext, aedilis: AedilisEventClient): Hono {
  const events = getEventStore();
  const facilities = getFacilityStore();
  const routes = new Hono();

  routes.get('/facilities', async (c) => {
    const master = await facilities.list();
    try {
      const knownIds = new Set(master.map((item) => item.aedilisFacilityId));
      const suggestions = (await aedilis.listFacilities(c))
        .filter((item) => !knownIds.has(item.id));
      return c.json({
        items: master.map(facilityView),
        suggestions: suggestions.map(candidateView),
        aedilisAvailable: true,
      });
    } catch (error) {
      return c.json({
        items: master.map(facilityView),
        suggestions: [],
        aedilisAvailable: false,
        downstreamStatus: error instanceof AedilisRequestError ? error.status : 502,
      });
    }
  });

  routes.get('/events', async (c) => {
    const includePast = c.req.query('all') === '1';
    return c.json({ events: (await events.list(includePast)).map(eventView) });
  });

  routes.post('/events', async (c) => {
    const identity = getIdentity(c);
    const parsed = eventInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_event' }, 400);
    const startsAt = timestamp(parsed.data.startsAt);
    const endsAt = timestamp(parsed.data.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
      return c.json({ error: 'invalid_event_period' }, 400);
    }

    let facility: GlabFacility | null;
    try {
      facility = await resolveFacility(c, aedilis, parsed.data.facilityId);
    } catch (error) {
      return error instanceof AedilisRequestError
        ? aedilisFailure(error)
        : c.json({ error: 'facility_lookup_failed' }, 502);
    }
    if (!facility) return c.json({ error: 'facility_not_found' }, 400);

    let reservationId: string;
    try {
      reservationId = await aedilis.createReservation(c, {
        facilityId: facility.aedilisFacilityId,
        startsAt,
        endsAt,
        purpose: parsed.data.title,
      });
    } catch (error) {
      return error instanceof AedilisRequestError
        ? aedilisFailure(error)
        : c.json({ error: 'aedilis_reservation_failed' }, 502);
    }

    let eventId: number;
    try {
      eventId = await events.create({
        title: parsed.data.title,
        body: parsed.data.body?.trim() || null,
        location: facility.displayName,
        startsAt,
        endsAt,
        facilityId: facility.id,
        reservationId,
        createdBy: identity.userId,
      });
    } catch (error) {
      await aedilis.cancelReservation(c, reservationId).catch(() => undefined);
      throw error;
    }
    if (identity.displayName) cacheDisplayName(ctx.db, identity.userId, identity.displayName);
    const created = await events.get(eventId);
    return c.json({ ok: true, event: created ? eventView(created) : null });
  });

  routes.delete('/events/:id', async (c) => {
    const identity = getIdentity(c);
    const eventId = Number(c.req.param('id'));
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
      return c.json({ error: 'invalid_event_id' }, 400);
    }
    const event = await events.get(eventId);
    if (!event) return c.json({ error: 'not_found' }, 404);
    if (event.created_by !== identity.userId && !identity.isAdmin) {
      return c.json({ error: 'forbidden' }, 403);
    }
    let aedilisCancelFailed = false;
    if (event.reservation_id) {
      try {
        await aedilis.cancelReservation(c, event.reservation_id);
      } catch (error) {
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
    await events.delete(eventId);
    return c.json({ ok: true, aedilisCancelFailed });
  });

  return routes;
}

const eventsModule: CorpusModule = {
  id: 'events',
  title: 'イベント',
  icon: '📅',
  async setup(ctx: CorpusContext) {
    const connector = new VersionedHttpServiceConnector({
      id: 'aedilis',
      title: '施設予約 (Aedilis)',
      scope: 'multi',
      baseUrl: ctx.env('AEDILIS_BASE_URL') ?? '',
      healthPath: '/api/health',
    });
    const aedilis = new AedilisEventClient(connector, ctx.tokenProvider);
    ctx.registerRoute(makeRoutes(ctx, aedilis));
    ctx.registerPanel({ title: 'イベント', icon: '📅' });
    ctx.logger.info('events ready (GLAB PostgreSQL + Aedilis reservations)');
  },
};

export default eventsModule;
