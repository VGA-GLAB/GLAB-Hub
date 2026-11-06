/** Existing cross-service event operations keep a separate finite grant from local views.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { getEventStore } from '../events/store.ts';
import { approved, classify } from './operation-classification.ts';
type EventReader = Pick<ReturnType<typeof getEventStore>, 'get'>;
function member(identity: AuthIdentity): boolean { return identity.userId.trim().length > 0 && approved(identity); }

export function eventMutationOperationPolicy(events: () => EventReader = getEventStore): ServiceOperationPolicy {
  return c => {
    const path = c.req.path, method = c.req.method;
    if (path === '/api/x/events/facilities' && method === 'GET') return classify('events.facilities.read', 'read', (_c, identity) => member(identity), 0);
    if (path === '/api/x/events/meet/organizations' && method === 'GET') return classify('events.organizations.read', 'sensitive_read', (_c, identity) => member(identity), 0);
    if (path === '/api/x/events/events' && method === 'POST') return classify('events.create', 'important', (_c, identity) => member(identity), 16 * 1024);
    const parts = path.split('/');
    if (parts.slice(0, 5).join('/') !== '/api/x/events/events' || !/^[1-9][0-9]*$/.test(parts[5] ?? '')) return null;
    const id = Number(parts[5]); if (!Number.isSafeInteger(id)) return null;
    const action = parts.length === 6 && method === 'DELETE' ? 'events.delete'
      : parts.length === 7 && parts[6] === 'meet' && method === 'POST' ? 'events.meet.create' : null;
    return action ? classify(action, 'important', async (_c, identity) => {
      if (!member(identity)) return false;
      const event = await events().get(id);
      return !!event && member(identity) && (event.created_by === identity.userId || identity.isAdmin);
    }, method === 'DELETE' ? 0 : 8192) : null;
  };
}
