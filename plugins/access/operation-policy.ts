/** Explicit GLAB actions and live GLAB resource authorization, including GET.
 * Endpoints retain their own row/transaction authorization after this common gate.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { readAdmission } from './store.ts';
import { getGpsPhoto, getProject } from '../data.ts';
import { isWorkMember, listShowcaseRows, workDownloads } from '../projects/showcase-store.ts';
import { approved, classify, selfResource } from './operation-classification.ts';
import { attendanceOperationPolicy } from './attendance-operations.ts';
import { mediaOperationPolicy } from './media-operations.ts';
import { memberContentOperationPolicy } from './member-content-operations.ts';
import { questOperationPolicy } from './quest-operations.ts';
import { voluptasOperationPolicy } from './voluptas-operations.ts';
import { forumOperationPolicy } from './forum-operations.ts';
import { consultOperationPolicy } from './consult-operations.ts';

const attendance = attendanceOperationPolicy();
const coreMetadata = new Map([
  ['/api/hub/connectors', 'hub.connectors.read'], ['/api/hub/modules', 'hub.modules.read'], ['/api/hub/services', 'hub.services.read'],
]);

export const glabOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  const memberContent = memberContentOperationPolicy(c) ?? questOperationPolicy(c);
  if (memberContent) return memberContent;
  const discussion = forumOperationPolicy(c) ?? consultOperationPolicy(c);
  if (discussion) return discussion;
  const media = mediaOperationPolicy(c);
  if (media) return media;
  const voluptas = voluptasOperationPolicy(c);
  if (voluptas) return voluptas;
  const attendanceOperation = attendance(c);
  if (attendanceOperation) return attendanceOperation;
  if (method === 'GET' && path === '/api/me') return classify('identity.self.read', 'sensitive_read', selfResource);
  if (method === 'GET' && path === '/api/x/access/self') return classify('admission.self.read', 'sensitive_read', selfResource);
  if (method === 'GET' && path === '/api/x/facility/groups') return classify('identity.organizations.read', 'sensitive_read', (_ctx, identity) => approved(identity));
  if (method === 'GET' && path === '/api/x/vantan-user/face-consent/policy') return classify('identity.face-consent.policy', 'read', (_ctx, identity) => approved(identity));
  if (method === 'GET' && path === '/api/x/vantan-user/face-consent/status') return classify('identity.face-consent.read', 'sensitive_read', (_ctx, identity) => approved(identity));
  if (path === '/api/x/vantan-user/face-consent' && method === 'POST') return classify('identity.face-consent.create', 'important', (_ctx, identity) => approved(identity));
  if (path === '/api/x/vantan-user/face-consent' && method === 'DELETE') return classify('identity.face-consent.revoke', 'important', (_ctx, identity) => approved(identity));
  // Existing memberAccessPolicy redacts these metadata responses for pending
  // applicants; the same verified subject must still be used for that redaction.
  const metadata = method === 'GET' ? coreMetadata.get(path) : undefined;
  if (metadata) return classify(metadata, 'read', selfResource);
  if (method === 'GET' && path === '/api/x/access/requests') {
    return classify('admission.requests.read', 'sensitive_read', (_ctx, identity) => approved(identity) && identity.isAdmin);
  }
  const admission = /^\/api\/x\/access\/requests\/([^/]+)$/.exec(path);
  if (method === 'PUT' && admission) return classify('admission.decide', 'important', (_ctx, identity) =>
    approved(identity) && identity.isAdmin && readAdmission(currentAdmissionDatabase(), decodeURIComponent(admission[1] ?? '')) !== null);
  const gpsPhoto = /^\/api\/x\/attendance\/gps-photos\/([^/]+)$/.exec(path);
  if (method === 'GET' && gpsPhoto) return classify('attendance.gps-photo.read', 'sensitive_read', (_ctx, identity) => {
    if (!approved(identity)) return false;
    // Existing GLAB policy makes check-in evidence visible to admitted members;
    // it is not public. Verify the actual current record before reading a file.
    return getGpsPhoto(currentAdmissionDatabase(), decodeURIComponent(gpsPhoto[1] ?? '')) !== null;
  });
  if (path === '/api/x/library/budget' && method === 'GET') return classify('budget.read', 'sensitive_read', (_ctx, identity) => approved(identity));
  if (path === '/api/x/library/budget' && method === 'PUT') return classify('budget.update', 'important', (_ctx, identity) => approved(identity) && identity.isAdmin);
  if (method === 'GET' && path === '/api/x/projects/showcase/manage') return classify('showcase.manage.read', 'sensitive_read', (_ctx, identity) => approved(identity) && identity.isAdmin);
  if (method === 'GET' && path === '/api/x/projects/showcase/mine') return classify('showcase.own.read', 'sensitive_read', (_ctx, identity) => approved(identity));
  const showcase = /^\/api\/x\/projects\/showcase\/(manage|mine)\/([^/]+)$/.exec(path);
  if (method === 'PUT' && showcase) return classify(`showcase.${showcase[1]}.update`, 'important', async (_ctx, identity) => {
    if (!approved(identity)) return false;
    const id = decodeURIComponent(showcase[2] ?? ''), db = currentAdmissionDatabase();
    if (!getProject(db, id)) return false;
    if (showcase[1] === 'manage') return identity.isAdmin;
    const input = await _ctx.req.json().catch(() => null) as { featured?: unknown } | null;
    if (!input || Object.keys(input).length !== 1 || typeof input.featured !== 'boolean') return false;
    // Existing GLAB policy lets the subject unlink their own profile even after
    // leaving a work. Publishing still requires current membership. The endpoint
    // always binds the deleted profile row to this verified identity.userId.
    return input.featured === false || isWorkMember(db, id, identity.userId);
  });
  if (method === 'GET' && path === '/api/x/projects/showcase/works') return classify('showcase.published.read', 'read', (_ctx, identity) => approved(identity));
  const download = /^\/api\/x\/projects\/showcase\/download\/([^/]+)$/.exec(path);
  if (method === 'GET' && download) return classify('showcase.download', 'sensitive_read', (_ctx, identity) => {
    if (!approved(identity)) return false;
    const id = decodeURIComponent(download[1] ?? ''), db = currentAdmissionDatabase();
    return listShowcaseRows(db).some(row => row.project_id === id && row.published === 1) && workDownloads(db, id).length > 0;
  });
  // Migration is deliberately incomplete: do not silently authorize an entire
  // module/prefix or assume every GET is a harmless read. Remaining route ACLs
  // must be reviewed and added before coordinated deployment.
  return null;
};
