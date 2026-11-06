/** Forum operations retain current audience, author and administrator rules.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { findThread } from '../forum/store.ts';
import { canSee, parseAudience, resolveRoles } from '../roles/audience.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

export const forumOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  if (path === '/api/x/forum/threads' && ['GET', 'POST'].includes(method)) {
    // The collection endpoint applies current role/audience filtering to rows.
    return classify(method === 'GET' ? 'forum.threads.list' : 'forum.thread.create', method === 'GET' ? 'sensitive_read' : 'important',
      (_context, identity) => approved(identity));
  }
  const match = path.match(/^\/api\/x\/forum\/threads\/([^/]+)(?:\/(comments|pin))?$/);
  if (!match || !(method === 'GET' && match[2] !== 'pin' || method === 'POST' && match[2] || method === 'DELETE' && !match[2])) return null;
  let id: string;
  try { id = decodeURIComponent(match[1] ?? ''); } catch { return null; }
  if (!id || id.includes('/')) return null;
  const action = match[2] === 'pin' ? 'forum.thread.pin' : match[2] === 'comments' ? method === 'GET' ? 'forum.comments.read' : 'forum.comment.create'
    : method === 'GET' ? 'forum.thread.read' : 'forum.thread.delete';
  return classify(action, method === 'GET' ? 'sensitive_read' : 'important', (_context, identity) => {
    if (!approved(identity)) return false;
    const db = currentAdmissionDatabase(), thread = findThread(db, id);
    if (!thread) return false;
    if (action === 'forum.thread.pin') return identity.isAdmin;
    if (action === 'forum.thread.delete') return thread.created_by === identity.userId || identity.isAdmin;
    return canSee(parseAudience(thread.audience_roles), resolveRoles(db, identity.userId), thread.created_by === identity.userId, identity.isAdmin);
  });
};
