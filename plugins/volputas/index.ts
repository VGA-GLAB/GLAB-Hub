import { Hono } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { normalizeHttpBaseUrl } from './entry-points.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { proxy } from '../shared.ts';

const GLAB_SURVEYS_PATH = '/api/v1/integrations/glab/surveys';

const volputasModule: CorpusModule = {
  id: 'volputas',
  title: 'レビュー',
  icon: '📝',
  setup(ctx: CorpusContext) {
    const apiBaseUrl = normalizeHttpBaseUrl(ctx.env('VOLPUTAS_URL'), 'VOLPUTAS_URL');
    const connector = new VersionedHttpServiceConnector({
      id: 'volputas',
      title: 'レビュー (Volputas)',
      scope: 'multi',
      baseUrl: apiBaseUrl ?? '',
      healthPath: '/health',
    });
    ctx.registerConnector(connector);

    const routes = new Hono();
    routes.get('/surveys', (c) => proxy(
      c, connector, GLAB_SURVEYS_PATH, ctx.tokenProvider, 'volputas',
    ));
    routes.get('/surveys/:id', (c) => proxy(
      c,
      connector,
      `${GLAB_SURVEYS_PATH}/${encodeURIComponent(c.req.param('id'))}`,
      ctx.tokenProvider,
      'volputas',
    ));
    routes.put('/surveys/:id/response', (c) => proxy(
      c,
      connector,
      `${GLAB_SURVEYS_PATH}/${encodeURIComponent(c.req.param('id'))}/response`,
      ctx.tokenProvider,
      'volputas',
    ));
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: 'レビュー', icon: '📝' });
    ctx.logger.info(
      `survey catalog → Volputas, responses → Cernere (${apiBaseUrl ?? '未設定 = degraded'})`,
    );
  },
};

export default volputasModule;
