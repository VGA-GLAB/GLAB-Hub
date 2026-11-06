/** Member discussion board and subject-bound presence operations.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { findConsult } from '../consult/store.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

export const consultOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  if (path === '/api/x/consult/consults' && ['GET', 'POST'].includes(method)) {
    return classify(method === 'GET' ? 'consults.list' : 'consult.create', method === 'GET' ? 'sensitive_read' : 'important',
      (_context, identity) => approved(identity));
  }
  if (path === '/api/x/consult/availability' && ['GET', 'PUT'].includes(method)) {
    // Only this verified subject is used by the endpoint. Its existing fresh
    // canEditPresence check is still mandatory immediately before a write.
    return classify(method === 'GET' ? 'presence.self.read' : 'presence.self.update', method === 'GET' ? 'sensitive_read' : 'important',
      (_context, identity) => approved(identity) && identity.userId.length > 0);
  }
  if (path === '/api/x/consult/available-members' && method === 'GET') {
    return classify('presence.members.read', 'sensitive_read', (_context, identity) => approved(identity) && identity.isAdmin);
  }
  const match = path.match(/^\/api\/x\/consult\/consults\/([^/]+)(\/resolve)?$/);
  if (!match || !(method === 'GET' && !match[2] || method === 'POST' && match[2])) return null;
  let id: string;
  try { id = decodeURIComponent(match[1] ?? ''); } catch { return null; }
  if (!id || id.includes('/')) return null;
  return classify(method === 'GET' ? 'consult.read' : 'consult.resolve', method === 'GET' ? 'sensitive_read' : 'important', (_context, identity) => {
    if (!approved(identity)) return false;
    const row = findConsult(currentAdmissionDatabase(), id);
    return row !== null && (method === 'GET' || row.created_by === identity.userId || identity.isAdmin);
  });
};
