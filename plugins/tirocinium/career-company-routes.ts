/** Verified-subject career relations; Cr remains the data owner.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import { Hono, getIdentity, type Context } from '../../corpus/server/hub/sdk.ts';
import type { CernereProjectApi } from '../cernere/shared-owner.ts';
import { approved } from '../access/operation-classification.ts';
import { getCareerCompanies, setCareerCompanies } from '../jobs/student-career-client.ts';
import { careerCompanySchema, offerCompanySchema } from '../jobs/student-career-schema.ts';
import { noStore } from '../shared.ts';

type RelationType = 'desired' | 'offer';
function relationType(value: string): RelationType | null { return value === 'desired' || value === 'offer' ? value : null; }
function denyChangedSubject(c: Context, subject: string): Response | null {
  if (c.req.raw.signal.aborted) return c.json({ error: 'request_ended' }, 408);
  const current = getIdentity(c);
  if (!subject || current.userId !== subject || !approved(current)) return c.json({ error: 'glab_approval_required' }, 403);
  return null;
}
function replaceById<T extends { companyId: string }>(rows: T[], row: T): T[] {
  return [...rows.filter(item => item.companyId !== row.companyId), row];
}

export function makeCareerCompanyRoutes(client: CernereProjectApi): Hono {
  const routes = new Hono();
  routes.use('*', async (c, next) => { noStore(c); await next(); });
  routes.get('/career-companies', async c => {
    const subject = getIdentity(c).userId;
    const denied = denyChangedSubject(c, subject); if (denied) return denied;
    try {
      const career = await getCareerCompanies(client, subject);
      const changed = denyChangedSubject(c, subject); if (changed) return changed;
      return c.json({ relations: [
        ...career.desiredCompanies.map(company => ({ ...company, type: 'desired' as const, roleTitle: '', offeredOn: null })),
        ...career.offerCompanies.map(company => ({ ...company, type: 'offer' as const })),
      ] });
    } catch {
      // Authority/issuer text can contain private details. Preserve only a stable code.
      return c.json({ error: 'cernere_unavailable' }, 503);
    }
  });
  routes.put('/career-companies/:relationType/:companyId', async c => {
    const type = relationType(c.req.param('relationType'));
    if (!type) return c.json({ error: 'invalid_relation_type' }, 400);
    const subject = getIdentity(c).userId;
    const denied = denyChangedSubject(c, subject); if (denied) return denied;
    try {
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      const afterBody = denyChangedSubject(c, subject); if (afterBody) return afterBody;
      const career = await getCareerCompanies(client, subject);
      const desired = type === 'desired' ? replaceById(career.desiredCompanies, careerCompanySchema.parse({
        companyId: c.req.param('companyId'), companyName: body.companyName, industry: body.industry,
      })) : career.desiredCompanies;
      const offers = type === 'offer' ? replaceById(career.offerCompanies, offerCompanySchema.parse({
        companyId: c.req.param('companyId'), companyName: body.companyName, industry: body.industry,
        roleTitle: body.roleTitle, offeredOn: body.offeredOn,
      })) : career.offerCompanies;
      // The preceding Cr read may yield. Check local admission and the same subject
      // immediately before the single remote write; never retry an unknown result.
      const changed = denyChangedSubject(c, subject); if (changed) return changed;
      await setCareerCompanies(client, subject, desired, offers);
      return c.json({ ok: true });
    } catch { return c.json({ error: 'career_write_failed' }, 503); }
  });
  routes.delete('/career-companies/:relationType/:companyId', async c => {
    const type = relationType(c.req.param('relationType'));
    if (!type) return c.json({ error: 'invalid_relation_type' }, 400);
    const subject = getIdentity(c).userId;
    const denied = denyChangedSubject(c, subject); if (denied) return denied;
    try {
      const career = await getCareerCompanies(client, subject);
      const companyId = c.req.param('companyId');
      const changed = denyChangedSubject(c, subject); if (changed) return changed;
      await setCareerCompanies(client, subject,
        type === 'desired' ? career.desiredCompanies.filter(row => row.companyId !== companyId) : career.desiredCompanies,
        type === 'offer' ? career.offerCompanies.filter(row => row.companyId !== companyId) : career.offerCompanies);
      return c.json({ ok: true });
    } catch { return c.json({ error: 'career_write_failed' }, 503); }
  });
  return routes;
}
