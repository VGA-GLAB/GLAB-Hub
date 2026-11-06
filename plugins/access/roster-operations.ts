/** Admin-only private roster operations with current target-row checks.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { getMember } from '../data.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

function administrator(identity: AuthIdentity): boolean {
  return identity.userId.length > 0 && approved(identity) && identity.isAdmin;
}
function rowId(value: string): string | null {
  try { const id = decodeURIComponent(value); return id && !id.includes('/') ? id : null; }
  catch { return null; }
}

export const rosterOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  if (method === 'GET' && path === '/api/x/members/list') return classify('roster.list', 'sensitive_read', (_context, identity) => administrator(identity));
  if (method === 'GET' && path === '/api/x/members/link-candidates') return classify('roster.link-candidates.read', 'sensitive_read', (_context, identity) => administrator(identity));
  if (method === 'POST' && ['/api/x/members', '/api/x/members/'].includes(path)) return classify('roster.create', 'important', (_context, identity) => administrator(identity));
  const row = /^\/api\/x\/members\/([^/]+)(\/link)?$/.exec(path);
  if (!row || !row[1]) return null;
  const action = row[2] ? method === 'POST' ? 'roster.link' : null
    : method === 'PATCH' ? 'roster.update' : method === 'DELETE' ? 'roster.delete' : null;
  const id = rowId(row[1]);
  if (!action || !id) return null;
  return classify(action, 'important', (_context, identity) => administrator(identity)
    && getMember(currentAdmissionDatabase(), id) !== null);
};
