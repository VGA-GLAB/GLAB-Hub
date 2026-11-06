/** Quest row ownership, project membership and approval roles at execution time.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, Context, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { getQuest } from '../quests/store.ts';
import { resolveRoles } from '../roles/audience.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

function approver(identity: AuthIdentity): boolean {
  const roles = resolveRoles(currentAdmissionDatabase(), identity.userId);
  return roles.includes('lead') || roles.includes('instructor');
}
async function projectAllowed(c: Context, identity: AuthIdentity): Promise<boolean> {
  const input = await c.req.json().catch(() => null) as { projectId?: unknown } | null;
  if (!input || input.projectId !== null && typeof input.projectId !== 'string') return false;
  if (input.projectId === null) return true;
  return Boolean(currentAdmissionDatabase().prepare("SELECT 1 FROM glab_project_member m JOIN glab_project p ON p.id=m.project_id WHERE m.user_id=? AND m.project_id=? AND p.status='active'")
    .get(identity.userId, input.projectId));
}

export const questOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  if (method === 'GET' && ['/api/x/quests/published', '/api/x/quests/mine', '/api/x/quests/pending'].includes(path)) {
    const pending = path.endsWith('/pending');
    return classify(pending ? 'quests.pending.read' : path.endsWith('/mine') ? 'quests.own.read' : 'quests.published.read', 'sensitive_read',
      (_context, identity) => approved(identity) && (!pending || approver(identity)));
  }
  if (method === 'POST' && ['/api/x/quests', '/api/x/quests/'].includes(path)) {
    return classify('quests.create', 'important', async (context, identity) => approved(identity) && await projectAllowed(context, identity));
  }
  const match = /^\/api\/x\/quests\/([^/]+)(?:\/(submit|withdraw|decision))?$/.exec(path);
  if (!match || (match[2] ? method !== 'POST' : method !== 'PUT')) return null;
  let id: string;
  try { id = decodeURIComponent(match[1] ?? ''); } catch { return null; }
  if (!id || id.includes('/')) return null;
  const action = match[2] ?? 'update';
  return classify(`quests.${action}`, 'important', async (context, identity) => {
    if (!approved(identity)) return false;
    const row = getQuest(currentAdmissionDatabase(), id);
    const input = await context.req.json().catch(() => null) as { revision?: unknown } | null;
    if (!row || !input || !Number.isSafeInteger(input.revision) || row.revision !== input.revision) return false;
    if (action === 'decision') return row.status === 'pending' && approver(identity);
    if (row.owner_id !== identity.userId) return false;
    if (action === 'submit') return row.status === 'draft';
    if (action === 'withdraw') return row.status !== 'withdrawn';
    return projectAllowed(context, identity);
  });
};
