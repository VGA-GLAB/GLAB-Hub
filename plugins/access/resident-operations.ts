/** Resident calls/availability retain live lease and recipient/subject ownership.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { hasActiveLease, hasInboxCall } from '../cocoiru/store.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

const prefix = '/api/x/cocoiru/resident/glab';
const reads = new Map([
  ['/api/x/cocoiru/active-members', 'resident.active-members.read'],
  [prefix + '/available', 'resident.available.read'], [prefix + '/inbox', 'resident.inbox.read'],
  [prefix + '/discord-lobby', 'resident.lobby-secret.read'],
]);
function member(identity: AuthIdentity): boolean { return identity.userId.length > 0 && approved(identity); }

export function residentOperationPolicy(now: () => number = Date.now): ServiceOperationPolicy {
  return c => {
    const path = c.req.path, method = c.req.method;
    const read = method === 'GET' ? reads.get(path) : undefined;
    if (read) return classify(read, 'sensitive_read', (_context, identity) => member(identity));
    if (path === prefix + '/availability' && method === 'PUT') return classify('resident.availability.update', 'important', (_context, identity) => member(identity), 8192);
    if (path === prefix + '/tasukete' && method === 'POST') return classify('resident.tasukete.create', 'important', (_context, identity) => member(identity), 8192);
    if (path === prefix + '/calls' && method === 'POST') {
      return classify('resident.call.create', 'important', async (context, identity) => {
        if (!member(identity)) return false;
        // The shared gate has already captured/bounded these exact bytes. Leave
        // the original raw body intact for the endpoint's strict bounded parser.
        const body = await context.req.raw.clone().json().catch(() => null) as { recipientId?: unknown } | null;
        return typeof body?.recipientId === 'string' && body.recipientId.length > 0 && body.recipientId.length <= 128
          && hasActiveLease(currentAdmissionDatabase(), body.recipientId, now());
      }, 8192);
    }
    const ack = /^\/api\/x\/cocoiru\/resident\/glab\/inbox\/([^/]+)$/.exec(path);
    if (!ack?.[1] || method !== 'DELETE') return null;
    let id: string;
    try { id = decodeURIComponent(ack[1]); } catch { return null; }
    if (!id || id.includes('/')) return null;
    return classify('resident.call.acknowledge', 'important', (_context, identity) => member(identity)
      && hasInboxCall(currentAdmissionDatabase(), identity.userId, id));
  };
}
