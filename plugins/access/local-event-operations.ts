/** Local event views and own absence reports, separate from external reservations.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { getEventStore } from '../events/store.ts';
import { canSee, parseAudience, resolveRoles } from '../roles/audience.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

type EventReader = Pick<ReturnType<typeof getEventStore>, 'get'>;
function member(identity: AuthIdentity): boolean { return identity.userId.length > 0 && approved(identity); }

export function localEventOperationPolicy(events: () => EventReader = getEventStore, now: () => number = Date.now): ServiceOperationPolicy {
  return c => {
    const path = c.req.path, method = c.req.method;
    if (path === '/api/x/events/events' && method === 'GET') {
      // The endpoint independently projects each current row by audience/roles.
      return classify('events.list', 'sensitive_read', (_context, identity) => member(identity));
    }
    const attendance = /^\/api\/x\/events\/events\/([1-9][0-9]*)\/attendance$/.exec(path);
    if (!attendance || !['GET', 'PUT'].includes(method)) return null;
    const id = Number(attendance[1]); if (!Number.isSafeInteger(id)) return null;
    return classify(method === 'GET' ? 'events.attendance.read' : 'events.absence.update', method === 'GET' ? 'sensitive_read' : 'important', async (_context, identity) => {
      if (!member(identity)) return false;
      const event = await events().get(id);
      // PostgreSQL reads may yield: re-read admission and current local roles
      // after that await rather than retain a positive pre-read decision.
      if (!event || !member(identity) || !event.meeting_id || event.recurrence !== 'none') return false;
      if (!canSee(parseAudience(event.audience_roles), resolveRoles(currentAdmissionDatabase(), identity.userId),
        event.created_by === identity.userId, identity.isAdmin)) return false;
      return method === 'GET' || (event.ends_at ?? event.starts_at) >= now();
    });
  };
}
