/** Route-owned member content classifications; row decisions are never cached.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { getJob } from '../data.ts';
import { findLink } from '../tech-links/store.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

const subjectReads = new Map([
  ['/api/x/dashboard/summary', 'dashboard.summary.read'], ['/api/x/dashboard/membership', 'dashboard.membership.read'],
  ['/api/x/dashboard/location', 'dashboard.location.read'], ['/api/x/dashboard/permissions', 'dashboard.permissions.read'],
  ['/api/x/jobs/career', 'career.self.read'],
]);
const memberReads = new Map([
  ['/api/x/tech-links/links', 'links.list'], ['/api/x/tech-links/tags', 'links.tags.read'],
  ['/api/x/jobs', 'jobs.list'], ['/api/x/jobs/', 'jobs.list'],
]);
const publicConfiguration = new Map([
  ['/api/x/dashboard/permission-settings', 'dashboard.permission-settings.read'],
  ['/api/x/tendentia/entry-points', 'trends.entry-points.read'], ['/api/x/tendentia/map', 'trends.map.read'],
]);
function member(identity: AuthIdentity): boolean { return approved(identity) && identity.userId.length > 0; }
function decoded(value: string | undefined): string | null {
  try { const result = decodeURIComponent(value ?? ''); return result && !result.includes('/') ? result : null; }
  catch { return null; }
}

export const memberContentOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  const read = method === 'GET' ? subjectReads.get(path) ?? memberReads.get(path) : undefined;
  if (read) return classify(read, 'sensitive_read', (_context, identity) => member(identity));
  const configuration = method === 'GET' ? publicConfiguration.get(path) : undefined;
  if (configuration) return classify(configuration, 'read', (_context, identity) => member(identity));
  const create = method === 'POST' && new Map([
    ['/api/x/tech-links/links', 'links.create'], ['/api/x/jobs', 'jobs.create'], ['/api/x/jobs/', 'jobs.create'],
    ['/api/x/dashboard/daily-quest/complete', 'dashboard.daily-quest.complete'],
  ]).get(path);
  if (create) return classify(create, 'important', (_context, identity) => member(identity));
  if (method === 'PUT' && path === '/api/x/jobs/career') return classify('career.self.update', 'important', (_context, identity) => member(identity));
  const link = /^\/api\/x\/tech-links\/links\/([^/]+)(\/comments)?$/.exec(path);
  if (link && (method === 'GET' || !link[2] && ['PATCH', 'DELETE'].includes(method) || link[2] && method === 'POST')) {
    const id = decoded(link[1]);
    if (!id) return null;
    const writeOwner = !link[2] && method !== 'GET';
    const action = link[2] ? `links.comments.${method === 'GET' ? 'read' : 'create'}`
      : method === 'GET' ? 'links.read' : method === 'PATCH' ? 'links.update' : 'links.delete';
    return classify(action, method === 'GET' ? 'sensitive_read' : 'important', (_context, identity) => {
      if (!member(identity)) return false;
      const row = findLink(currentAdmissionDatabase(), id);
      return row !== null && (!writeOwner || row.posted_by === identity.userId || identity.isAdmin);
    });
  }
  if (path === '/api/x/jobs/owner-migration' && method === 'GET') return classify('jobs.owners.audit', 'sensitive_read', (_context, identity) => member(identity) && identity.isAdmin);
  if (path === '/api/x/jobs/owner-migration/rollback' && method === 'POST') return classify('jobs.owners.rollback', 'important', (_context, identity) => member(identity) && identity.isAdmin);
  const job = /^\/api\/x\/jobs\/([1-9][0-9]*)\/(close|owner)$/.exec(path);
  if (job && (method === 'POST' && job[2] === 'close' || method === 'PUT' && job[2] === 'owner')) {
    const id = Number(job[1]); if (!Number.isSafeInteger(id)) return null;
    return classify(job[2] === 'owner' ? 'jobs.owner.update' : 'jobs.close', 'important', (_context, identity) => {
      if (!member(identity)) return false;
      const row = getJob(currentAdmissionDatabase(), id);
      return row !== null && (job[2] === 'owner' ? identity.isAdmin : row.owner_user_id === identity.userId || identity.isAdmin);
    });
  }
  return null;
};
