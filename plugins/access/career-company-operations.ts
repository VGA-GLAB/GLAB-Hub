/** Own Cr-managed career relations only; external Tirocinium calls stay separate.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { careerCompanySchema } from '../jobs/student-career-schema.ts';
import { approved, classify } from './operation-classification.ts';

export const careerCompanyOperationPolicy: ServiceOperationPolicy = c => {
  const prefix = '/api/x/tirocinium/career-companies';
  if (c.req.path === prefix && c.req.method === 'GET') {
    return classify('career.companies.self.read', 'sensitive_read', (_context, identity) => identity.userId.length > 0 && approved(identity));
  }
  if (!['PUT', 'DELETE'].includes(c.req.method)) return null;
  if (!c.req.path.startsWith(prefix + '/')) return null;
  const segments = c.req.path.slice(prefix.length + 1).split('/');
  if (segments.length !== 2 || !['desired', 'offer'].includes(segments[0] ?? '')) return null;
  let companyId: string;
  try { companyId = decodeURIComponent(segments[1] ?? ''); }
  catch { return null; }
  if (!careerCompanySchema.shape.companyId.safeParse(companyId).success) return null;
  return classify(c.req.method === 'PUT' ? 'career.companies.self.update' : 'career.companies.self.delete', 'important',
    (_context, identity) => identity.userId.length > 0 && approved(identity), 8192);
};
