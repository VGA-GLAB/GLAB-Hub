import { getIdentity, getDisplayName, type Hono, type CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { getEventStore } from '../events/store.ts';
import { canSee, parseAudience, resolveRoles } from '../roles/audience.ts';
import { approveEventAttendance, eventAttendanceApprovals, requestEventAttendance } from '../data.ts';

const DAY_MS = 86_400_000;

/** Event attendance is separate from facility presence and requires the event creator's explicit OK. */
export function registerEventAttendance(router: Hono, ctx: CorpusContext, store = getEventStore): void {
  router.get('/events', async c => {
    const identity = getIdentity(c);
    const roles = resolveRoles(ctx.db, identity.userId);
    const now = Date.now();
    const events = await store().list({ from: now - DAY_MS, to: now + DAY_MS });
    return c.json({ events: events.filter(event => canSee(parseAudience(event.audience_roles), roles,
      event.created_by === identity.userId, identity.isAdmin)).map(event => {
      const organizer = event.created_by === identity.userId;
      const requests = eventAttendanceApprovals(ctx.db, event.id, event.starts_at);
      return {
        id: event.id, title: event.title, startsAt: event.starts_at, createdBy: event.created_by,
        organizer, canRequest: event.starts_at <= now,
        requests: requests.filter(request => organizer || request.user_id === identity.userId).map(request => ({
          userId: request.user_id, name: getDisplayName(ctx.db, request.user_id), approved: request.approved_at != null,
        })),
      };
    }) });
  });
  for (const action of ['request', 'approve'] as const) router.post(`/events/${action}`, async c => {
    const body = await c.req.json().catch(() => null) as { eventId?: unknown; startsAt?: unknown; userId?: unknown } | null;
    if (typeof body?.eventId !== 'number' || !Number.isSafeInteger(body.eventId) || body.eventId < 1
      || typeof body.startsAt !== 'number' || !Number.isSafeInteger(body.startsAt) || body.startsAt < 0) {
      return c.json({ error: 'invalid_event' }, 400);
    }
    const now = Date.now();
    if (body.startsAt > now) return c.json({ error: 'event_not_started' }, 400);
    const events = await store().list({ from: body.startsAt, to: body.startsAt + 1 });
    const event = events.find(item => item.id === body.eventId && item.starts_at === body.startsAt);
    if (!event) return c.json({ error: 'event_not_found' }, 404);
    const identity = getIdentity(c);
    if (!canSee(parseAudience(event.audience_roles), resolveRoles(ctx.db, identity.userId),
      event.created_by === identity.userId, identity.isAdmin)) return c.json({ error: 'event_not_found' }, 404);
    if (action === 'request') {
      requestEventAttendance(ctx.db, event.id, event.starts_at, identity.userId, now);
      return c.json({ ok: true });
    }
    // Administrator status alone is not organizer approval.
    if (event.created_by !== identity.userId) return c.json({ error: 'organizer_required' }, 403);
    if (typeof body.userId !== 'string' || !body.userId) return c.json({ error: 'user_required' }, 400);
    const request = eventAttendanceApprovals(ctx.db, event.id, event.starts_at).find(item => item.user_id === body.userId);
    if (!request) return c.json({ error: 'attendance_request_not_found' }, 404);
    if (!request.approved_at) approveEventAttendance(ctx.db, event.id, event.starts_at, body.userId, identity.userId, now);
    return c.json({ ok: true });
  });
}
