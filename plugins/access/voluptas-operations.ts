/** Explicit host actions; Voluptas independently checks its current data ACL.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ClassifiedServiceOperation, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { approved, classify } from './operation-classification.ts';

interface Route { method: string; path: RegExp; action: string; risk: ClassifiedServiceOperation['risk']; admin?: true }
const routes: readonly Route[] = [
  { method: 'GET', path: /^\/surveys$/, action: 'survey.list', risk: 'sensitive_read' },
  { method: 'GET', path: /^\/surveys\/[^/]+$/, action: 'survey.read', risk: 'sensitive_read' },
  { method: 'POST', path: /^\/surveys$/, action: 'survey.create', risk: 'important', admin: true },
  { method: 'PATCH', path: /^\/surveys\/[^/]+$/, action: 'survey.update', risk: 'important', admin: true },
  { method: 'PUT', path: /^\/surveys\/[^/]+\/response$/, action: 'survey.respond', risk: 'important' },
  { method: 'GET', path: /^\/reviews$/, action: 'review.list', risk: 'sensitive_read' },
  { method: 'POST', path: /^\/reviews$/, action: 'review.create', risk: 'important' },
  { method: 'GET', path: /^\/reviews\/[^/]+\/follow-up$/, action: 'review.follow-up.read', risk: 'sensitive_read' },
  { method: 'POST', path: /^\/reviews\/[^/]+\/follow-up$/, action: 'review.follow-up.write', risk: 'important' },
  { method: 'GET', path: /^\/reviews\/analysis\/catalog$/, action: 'review.analysis.catalog', risk: 'read' },
  { method: 'GET', path: /^\/reviews\/analysis\/[^/]+$/, action: 'review.analysis.read', risk: 'sensitive_read' },
  { method: 'POST', path: /^\/reviews\/analysis\/[^/]+$/, action: 'review.analysis.create', risk: 'important' },
  { method: 'GET', path: /^\/recent-games$/, action: 'games.recent', risk: 'sensitive_read' },
  { method: 'GET', path: /^\/games$/, action: 'games.list', risk: 'sensitive_read' },
  { method: 'GET', path: /^\/games\/admin$/, action: 'games.admin.read', risk: 'sensitive_read', admin: true },
  { method: 'POST', path: /^\/games$/, action: 'games.create', risk: 'important', admin: true },
  { method: 'PATCH', path: /^\/games\/[^/]+$/, action: 'games.update', risk: 'important', admin: true },
  { method: 'GET', path: /^\/evidence\/emotion-curves$/, action: 'evidence.curves.read', risk: 'sensitive_read' },
  { method: 'POST', path: /^\/evidence\/emotion-curves$/, action: 'evidence.curves.create', risk: 'important' },
  { method: 'POST', path: /^\/evidence\/emotion-curves\/[^/]+\/evaluate$/, action: 'evidence.evaluate', risk: 'important' },
];
const PREFIX = '/api/x/volputas';
export const voluptasOperationPolicy: ServiceOperationPolicy = c => {
  if (!c.req.path.startsWith(PREFIX + '/')) return null;
  const path = c.req.path.slice(PREFIX.length);
  if (path === '/reviews/analysis/catalog' && c.req.method !== 'GET') return null;
  const route = routes.find(candidate => candidate.method === c.req.method && candidate.path.test(path));
  return route ? classify(route.action, route.risk, (_context, identity) => approved(identity) && (!route.admin || identity.isAdmin), 1024 * 1024) : null;
};
