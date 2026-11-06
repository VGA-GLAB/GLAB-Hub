/** Exact host decisions for hub metadata and administrator configuration only.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ClassifiedServiceOperation, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { approved, classify } from './operation-classification.ts';

interface Route { method: string; path: string; action: string; risk: ClassifiedServiceOperation['risk']; admin?: true }
const routes: readonly Route[] = [
  { method: 'GET', path: '/api/hub/overview', action: 'hub.overview.read', risk: 'sensitive_read' },
  { method: 'GET', path: '/api/hub/external-ids', action: 'hub.external-ids.read', risk: 'sensitive_read', admin: true },
  { method: 'POST', path: '/api/hub/external-ids/reassign', action: 'hub.external-ids.reassign', risk: 'important', admin: true },
  { method: 'GET', path: '/api/hub/discovery', action: 'hub.discovery.read', risk: 'sensitive_read', admin: true },
  { method: 'PUT', path: '/api/hub/discovery', action: 'hub.discovery.update', risk: 'important', admin: true },
  { method: 'GET', path: '/api/capabilities', action: 'hub.capabilities.read', risk: 'read' },
  { method: 'GET', path: '/api/capabilities/', action: 'hub.capabilities.read', risk: 'read' },
];

export const hubOperationPolicy: ServiceOperationPolicy = c => {
  const route = routes.find(candidate => candidate.method === c.req.method && candidate.path === c.req.path);
  if (!route) return null;
  // Current verified administration authorizes this host's configuration scope.
  // Endpoints still validate actual mappings, locked config and input, including
  // their transaction/update semantics after the one-use permit is consumed.
  return classify(route.action, route.risk, (_context, identity) => identity.userId.length > 0
    && approved(identity) && (!route.admin || identity.isAdmin));
};
