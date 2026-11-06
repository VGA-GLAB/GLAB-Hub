/** Signed software distribution keeps publication and artifact checks in its endpoint.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { libraryId } from '../software-library/schema.ts';
import { listLibraries } from '../software-library/store.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { approved, classify } from './operation-classification.ts';

function member(identity: AuthIdentity): boolean { return identity.userId.length > 0 && approved(identity); }

export const softwareLibraryOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  if (path === '/api/x/software-library/entries' && method === 'GET') return classify('software.catalog.read', 'read', (_context, identity) => member(identity));
  if (path === '/api/x/software-library/manage' && method === 'GET') return classify('software.catalog.manage.read', 'sensitive_read', (_context, identity) => member(identity) && identity.isAdmin);
  const route = /^\/api\/x\/software-library\/(entries|download)\/([^/]+)$/.exec(path);
  if (!route || !libraryId.safeParse(route[2]).success) return null;
  if (route[1] === 'entries' && method === 'PUT') return classify('software.entry.save', 'important', (_context, identity) => member(identity) && identity.isAdmin, 16 * 1024);
  if (route[1] !== 'download' || method !== 'POST') return null;
  return classify('software.release.download', 'sensitive_read', (_context, identity) => member(identity)
    && listLibraries(currentAdmissionDatabase(), false).some(entry => entry.id === route[2] && entry.published), 8192);
};
