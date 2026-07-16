import {
  Hono,
  getIdentity,
} from '../../corpus/server/hub/sdk.ts';
import type {
  CorpusContext,
  CorpusModule,
} from '../../corpus/server/hub/sdk.ts';
import { proxy } from '../shared.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { createCernereProjectClient } from '../cernere/create-client.ts';
import {
  getStudentCareer,
  setCareerCompanies,
} from '../jobs/student-career-client.ts';
import {
  careerCompanySchema,
  offerCompanySchema,
} from '../jobs/student-career-schema.ts';

type RelationType = 'desired' | 'offer';

function relationType(value: string): RelationType | null {
  return value === 'desired' || value === 'offer' ? value : null;
}

const tirociniumModule: CorpusModule = {
  id: 'tirocinium',
  title: '企業',
  icon: '🏢',
  setup(ctx: CorpusContext) {
    const tirocinium = new VersionedHttpServiceConnector({
      id: 'tirocinium',
      title: '企業・就活 (Tirocinium)',
      scope: 'multi',
      baseUrl: ctx.env('TIROCINIUM_URL') ?? '',
      healthPath: '/health',
    });
    ctx.registerConnector(tirocinium);
    const cernere = createCernereProjectClient(ctx);

    const routes = new Hono();
    routes.get('/companies', (c) => proxy(
      c,
      tirocinium,
      '/api/v1/companies',
      ctx.tokenProvider,
      'tirocinium',
    ));
    routes.get('/career-companies', async (c) => {
      try {
        const career = await getStudentCareer(cernere, getIdentity(c).userId);
        return c.json({ relations: [
          ...career.desiredCompanies.map((company) => ({ ...company, type: 'desired' as const, roleTitle: '', offeredOn: null })),
          ...career.offerCompanies.map((company) => ({ ...company, type: 'offer' as const })),
        ] });
      } catch (error) {
        return c.json({ error: 'cernere_unavailable', detail: String(error) }, 503);
      }
    });
    routes.put('/career-companies/:relationType/:companyId', async (c) => {
      const type = relationType(c.req.param('relationType'));
      if (!type) return c.json({ error: 'invalid_relation_type' }, 400);
      try {
        const identity = getIdentity(c);
        const career = await getStudentCareer(cernere, identity.userId);
        const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
        const desired = type === 'desired'
          ? replaceById(career.desiredCompanies, careerCompanySchema.parse({
            companyId: c.req.param('companyId'),
            companyName: body.companyName,
            industry: body.industry,
          }))
          : career.desiredCompanies;
        const offers = type === 'offer'
          ? replaceById(career.offerCompanies, offerCompanySchema.parse({
            companyId: c.req.param('companyId'),
            companyName: body.companyName,
            industry: body.industry,
            roleTitle: body.roleTitle,
            offeredOn: body.offeredOn,
          }))
          : career.offerCompanies;
        await setCareerCompanies(cernere, identity.userId, desired, offers);
        return c.json({ ok: true });
      } catch (error) {
        return c.json({ error: 'career_write_failed', detail: String(error) }, 503);
      }
    });
    routes.delete('/career-companies/:relationType/:companyId', async (c) => {
      const type = relationType(c.req.param('relationType'));
      if (!type) return c.json({ error: 'invalid_relation_type' }, 400);
      try {
        const identity = getIdentity(c);
        const career = await getStudentCareer(cernere, identity.userId);
        const companyId = c.req.param('companyId');
        await setCareerCompanies(
          cernere,
          identity.userId,
          type === 'desired' ? career.desiredCompanies.filter((row) => row.companyId !== companyId) : career.desiredCompanies,
          type === 'offer' ? career.offerCompanies.filter((row) => row.companyId !== companyId) : career.offerCompanies,
        );
        return c.json({ ok: true });
      } catch (error) {
        return c.json({ error: 'career_write_failed', detail: String(error) }, 503);
      }
    });
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: '企業', icon: '🏢' });
    ctx.logger.info(
      `career companies → Tirocinium (${ctx.env('TIROCINIUM_URL') || '未設定 = degraded'})`,
    );
  },
};

function replaceById<T extends { companyId: string }>(rows: T[], row: T): T[] {
  return [...rows.filter((item) => item.companyId !== row.companyId), row];
}

export default tirociniumModule;
