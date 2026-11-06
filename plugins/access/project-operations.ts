/** Project registry and membership-bound TEAM operations, separate from showcase.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { getProject, getProjectWithMembers } from '../data.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

function member(identity: AuthIdentity): boolean { return identity.userId.length > 0 && approved(identity); }
function decoded(value: string | undefined): string | null {
  try { const id = decodeURIComponent(value ?? ''); return id && !id.includes('/') ? id : null; }
  catch { return null; }
}

export const projectOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  if (path === '/api/x/projects/projects' && method === 'GET') return classify('projects.list', 'sensitive_read', (_context, identity) => member(identity));
  if (path === '/api/x/projects/projects' && method === 'POST') return classify('projects.create', 'important', (_context, identity) => member(identity) && identity.isAdmin);
  if (path === '/api/x/projects/known-users' && method === 'GET') return classify('projects.known-users.read', 'sensitive_read', (_context, identity) => member(identity) && identity.isAdmin);
  if (path === '/api/x/projects/teams/mine' && method === 'GET') return classify('teams.own.read', 'sensitive_read', (_context, identity) => member(identity));
  const team = /^\/api\/x\/projects\/teams\/([^/]+)$/.exec(path);
  if (team && method === 'GET') {
    const id = decoded(team[1]); if (!id) return null;
    return classify('teams.detail.read', 'sensitive_read', (_context, identity) => {
      if (!member(identity)) return false;
      const project = getProjectWithMembers(currentAdmissionDatabase(), id);
      // Current membership is mandatory even for an administrator, matching the
      // TEAM endpoint. A registry-wide read grant does not grant a TEAM view.
      return project?.status === 'active' && project.members.some(row => row.user_id === identity.userId);
    });
  }
  const read = /^\/api\/x\/projects\/projects\/([^/]+)(?:\/(releases|analysis-summary|analysis-files\/.+))?$/.exec(path);
  if (read && method === 'GET') {
    const id = decoded(read[1]); if (!id) return null;
    const action = !read[2] ? 'projects.detail.read' : read[2] === 'releases' ? 'projects.releases.read'
      : read[2] === 'analysis-summary' ? 'projects.analysis.summary.read' : 'projects.analysis.file.read';
    return classify(action, 'sensitive_read', (_context, identity) => member(identity) && getProject(currentAdmissionDatabase(), id) !== null);
  }
  const write = /^\/api\/x\/projects\/projects\/([^/]+)(?:\/(github-sync|members\/([^/]+)))?$/.exec(path);
  if (!write) return null;
  const id = decoded(write[1]); if (!id || write[3] && !decoded(write[3])) return null;
  const action = !write[2] && method === 'PATCH' ? 'projects.update'
    : write[2] === 'github-sync' && method === 'POST' ? 'projects.github.sync'
      : write[3] && method === 'PUT' ? 'projects.member.assign' : write[3] && method === 'DELETE' ? 'projects.member.remove' : null;
  if (!action) return null;
  return classify(action, 'important', (_context, identity) => member(identity) && identity.isAdmin
    && getProject(currentAdmissionDatabase(), id) !== null);
};
