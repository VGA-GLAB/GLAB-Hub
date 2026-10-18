import { getIdentity, type Context, type CorpusContext, type ServiceConnector } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { getEventStore } from '../events/store.ts';
import { getFacilityStore } from '../events/facility-store.ts';
import { bookingGroups, bookingProxy } from './booking-proxy.ts';

const snapshotSchema = z.object({
  meetingId: z.string().uuid(), title: z.string().min(1).max(150), description: z.string().max(3000),
  createdBy: z.string().min(1), facilityId: z.string().nullable(), reservationId: z.string().nullable(),
  slot: z.object({ id: z.string(), venue: z.string(), startAt: z.string().datetime(), endAt: z.string().datetime() }),
});
const selectionSchema = z.object({ slotId: z.string().min(1).max(64), revision: z.number().int().positive() }).strict();

/** Ae owns the reservation. Never call the ordinary event creation route (it would reserve again). */
export async function finalizeMeetingEvent(c: Context, ctx: CorpusContext, connector: ServiceConnector): Promise<Response> {
  const id = c.req.param('id');
  if (!id || !z.string().uuid().safeParse(id).success) return c.json({ error: 'invalid_meeting' }, 400);
  const input = selectionSchema.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: 'invalid_selection' }, 400);
  const response = await bookingProxy(c, ctx, connector, `/api/meetings/${id}/glab-event/finalize`, bookingGroups,
    { method: 'POST', body: JSON.stringify(input.data) });
  if (!response.ok) return response;
  try {
    const snapshot = snapshotSchema.parse(await response.json());
    if (snapshot.meetingId !== id || snapshot.createdBy !== getIdentity(c).userId
      || snapshot.slot.id !== input.data.slotId || Date.parse(snapshot.slot.endAt) <= Date.parse(snapshot.slot.startAt)
      || (!!snapshot.facilityId !== !!snapshot.reservationId)) throw new Error('invalid handoff');
    let facilityId: string | null = null;
    if (snapshot.facilityId) {
      const facilities = getFacilityStore();
      const existing = (await facilities.list()).find(f => f.aedilisFacilityId === snapshot.facilityId);
      facilityId = existing?.id ?? (await facilities.promote({ id: snapshot.facilityId,
        aedilisFacilityId: snapshot.facilityId, displayName: snapshot.slot.venue })).id;
    }
    const store = getEventStore();
    const eventId = await store.importMeeting(id, { title: snapshot.title, body: snapshot.description,
      location: snapshot.slot.venue, startsAt: Date.parse(snapshot.slot.startAt), endsAt: Date.parse(snapshot.slot.endAt),
      facilityId, reservationId: snapshot.reservationId, createdBy: snapshot.createdBy });
    if (!await store.get(eventId)) return c.json({ error: 'この調査から作ったGLABの予定は削除済みです' }, 409);
    return c.json({ ok: true, eventId });
  } catch {
    ctx.logger.error('Meeting finalized in Aedilis but GLAB event registration is unconfirmed');
    return c.json({ error: 'Aedilisの日程は確定済みですが、GLABの予定登録は未確認です。同じ候補で「GLABの予定に登録」を再操作してください。', retryable: true }, 503);
  }
}

export function cancelMeetingEvent(c: Context, ctx: CorpusContext, connector: ServiceConnector, meetingId: string): Promise<Response> {
  return bookingProxy(c, ctx, connector, `/api/meetings/${encodeURIComponent(meetingId)}/glab-event/cancel`,
    bookingGroups, { method: 'POST', body: '{}' });
}
