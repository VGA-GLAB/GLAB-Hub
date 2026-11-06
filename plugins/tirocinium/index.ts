import {
  Hono,
} from '../../corpus/server/hub/sdk.ts';
import type {
  CorpusContext,
  CorpusModule,
} from '../../corpus/server/hub/sdk.ts';
import { proxy } from '../shared.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { createCernereProjectClient } from '../cernere/create-client.ts';
import { makeCallRoutes } from './call-routes.ts';
import { makeCareerCompanyRoutes } from './career-company-routes.ts';

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
    routes.route('/calls', makeCallRoutes(ctx, tirocinium));
    routes.get('/companies', (c) => proxy(
      c,
      tirocinium,
      '/api/v1/companies',
      ctx.tokenProvider,
      'tirocinium',
    ));
    routes.route('/', makeCareerCompanyRoutes(cernere));
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: '企業', icon: '🏢' });
    ctx.logger.info(
      `career companies → Tirocinium (${ctx.env('TIROCINIUM_URL') || '未設定 = degraded'})`,
    );
  },
};

export default tirociniumModule;
