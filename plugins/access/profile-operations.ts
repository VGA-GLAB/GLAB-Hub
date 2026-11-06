/** Own-profile classifications; pending applicants still use Cr signup fields.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { approved, classify } from './operation-classification.ts';

const profiles = new Map([
  ['/api/x/vantan-user/profile', 'identity.profile'],
  ['/api/x/vantan-user/public-name', 'identity.public-name'],
  ['/api/x/vantan-user/steam-profile', 'identity.steam-profile'],
]);

export const profileOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  if (method === 'GET' && path === '/api/x/vantan-user/cernere-link') {
    return classify('identity.settings-link.read', 'read', (_context, identity) => identity.userId.length > 0 && approved(identity));
  }
  const profile = profiles.get(path);
  if (!profile || !['GET', 'PUT'].includes(method)) return null;
  // Each handler derives its sole subject from getIdentity(c). Query/body fields
  // cannot select another profile; body validation and Cr consent remain final.
  return classify(`${profile}.${method === 'GET' ? 'read' : 'update'}`, method === 'GET' ? 'sensitive_read' : 'important',
    (_context, identity) => identity.userId.length > 0 && approved(identity));
};
