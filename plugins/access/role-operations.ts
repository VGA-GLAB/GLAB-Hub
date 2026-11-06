/** Exact role operations; management never follows a caller-supplied role claim.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ClassifiedServiceOperation, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { approved, classify } from './operation-classification.ts';

const reads = new Map<string, readonly [string, ClassifiedServiceOperation['risk']]>([
  ['/api/x/roles/me', ['roles.self.read', 'sensitive_read']],
  ['/api/x/roles/defs', ['roles.definitions.read', 'read']],
  ['/api/x/roles/members', ['roles.members.read', 'sensitive_read']],
]);

export const roleOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  const read = method === 'GET' ? reads.get(path) : undefined;
  if (read) return classify(read[0], read[1], (_context, identity) => identity.userId.length > 0 && approved(identity));
  const create = method === 'POST' && new Map([
    ['/api/x/roles/defs', 'roles.definition.save'], ['/api/x/roles/members', 'roles.member.assign'],
  ]).get(path);
  const remove = method === 'DELETE' && (
    /^\/api\/x\/roles\/defs\/[a-z][a-z0-9_-]{0,62}$/.test(path) ? 'roles.definition.delete'
      : /^\/api\/x\/roles\/members\/[^/]+\/[a-z][a-z0-9_-]{0,62}$/.test(path) ? 'roles.member.remove' : undefined
  );
  const action = create || remove;
  if (!action) return null;
  // This role comes from the live verified service identity, never the body or
  // selected role definition. The endpoint retains its independent requireAdmin.
  return classify(action, 'important', (_context, identity) => identity.userId.length > 0 && approved(identity) && identity.isAdmin);
};
