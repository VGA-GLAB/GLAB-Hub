/** Attendance has distinct collection, subject, organizer and administrator ACLs.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, Context, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { eventAttendanceApprovals } from '../data.ts';
import { getEventStore } from '../events/store.ts';
import { canSee, parseAudience, resolveRoles } from '../roles/audience.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

const reads = new Map([
  ['/availability', 'availability'], ['/today', 'today'], ['/mine', 'own'], ['/events', 'events'],
]);
const prefix = '/api/x/attendance';
type EventReader = Pick<ReturnType<typeof getEventStore>, 'list'>;

export function attendanceOperationPolicy(events: () => EventReader = getEventStore): ServiceOperationPolicy {
  return c => {
    const path = c.req.path, method = c.req.method;
    const read = method === 'GET' ? reads.get(path.slice(prefix.length)) : undefined;
    if (!path.startsWith(prefix + '/')) return null;
    if (read) return classify(`attendance.${read}.read`, 'sensitive_read', (_ctx, identity) => approved(identity));
    if (method === 'GET' && ['/list', '/summary'].some(suffix => path === prefix + suffix)) {
      return classify(`attendance.${path.endsWith('/list') ? 'list' : 'summary'}.read`, 'sensitive_read', (_ctx, identity) => approved(identity) && identity.isAdmin);
    }
    if (method !== 'POST') return null;
    if (path === prefix + '/automatic/targets') return classify('attendance.facility-targets.read', 'sensitive_read', (_ctx, identity) => approved(identity));
    if (path === prefix + '/checkin') return classify('attendance.checkin', 'important', (_ctx, identity) => approved(identity));
    if (path === prefix + '/automatic/checkin') return classify('attendance.automatic.checkin', 'important', (_ctx, identity) => approved(identity));
    // Match the existing 10 MiB photograph + 64 KiB multipart allowance. The
    // endpoint still verifies signature, subject, freshness, nonce and location.
    if (path === prefix + '/checkin/gps') return classify('attendance.gps.checkin', 'important', (_ctx, identity) => approved(identity), 10 * 1024 * 1024 + 64 * 1024);
    if (path === prefix + '/manual') return classify('attendance.manual.checkin', 'important', (_ctx, identity) => approved(identity) && identity.isAdmin);
    if (path === prefix + '/events/request' || path === prefix + '/events/approve') {
      const approve = path.endsWith('/approve');
      return classify(`attendance.event.${approve ? 'approve' : 'request'}`, 'important', (ctx, identity) => eventPermission(ctx, identity, approve, events));
    }
    return null;
  };
}

async function eventPermission(c: Context, identity: AuthIdentity, approve: boolean, events: () => EventReader): Promise<boolean> {
  if (!approved(identity)) return false;
  const body = await c.req.json().catch(() => null) as { eventId?: unknown; startsAt?: unknown; userId?: unknown } | null;
  if (!body || typeof body.eventId !== 'number' || !Number.isSafeInteger(body.eventId) || body.eventId < 1
    || typeof body.startsAt !== 'number' || !Number.isSafeInteger(body.startsAt) || body.startsAt < 0 || body.startsAt > Date.now()) return false;
  const event = (await events().list({ from: body.startsAt, to: body.startsAt + 1 }))
    .find(item => item.id === body.eventId && item.starts_at === body.startsAt);
  if (!event) return false;
  const db = currentAdmissionDatabase();
  if (!canSee(parseAudience(event.audience_roles), resolveRoles(db, identity.userId), event.created_by === identity.userId, identity.isAdmin)) return false;
  if (!approve) return true;
  // Admin status never substitutes for this event organizer's own approval.
  return event.created_by === identity.userId && typeof body.userId === 'string' && body.userId.length > 0
    && eventAttendanceApprovals(db, event.id, event.starts_at).some(request => request.user_id === body.userId);
}
