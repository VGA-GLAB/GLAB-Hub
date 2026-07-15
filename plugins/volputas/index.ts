import { Hono, HttpServiceConnector } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import {
  createVolputasEntryPoints,
  normalizeHttpBaseUrl,
} from './entry-points.ts';

const volputasModule: CorpusModule = {
  id: 'volputas',
  title: 'レビュー',
  icon: '📝',
  setup(ctx: CorpusContext) {
    const apiBaseUrl = normalizeHttpBaseUrl(ctx.env('VOLPUTAS_URL'), 'VOLPUTAS_URL');
    const configuredWebBaseUrl = normalizeHttpBaseUrl(
      ctx.env('VOLPUTAS_WEB_URL'),
      'VOLPUTAS_WEB_URL',
    );
    const webBaseUrl = configuredWebBaseUrl ?? apiBaseUrl;
    const entryPoints = webBaseUrl ? createVolputasEntryPoints(webBaseUrl) : null;

    ctx.registerConnector(new HttpServiceConnector({
      id: 'volputas',
      title: 'レビュー (Volputas)',
      scope: 'multi',
      baseUrl: apiBaseUrl ?? '',
      healthPath: '/health',
    }));

    const routes = new Hono();
    routes.get('/entry-points', (c) => {
      if (!entryPoints) {
        return c.json({ error: 'volputas_unconfigured' }, 503);
      }
      return c.json(entryPoints);
    });
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: 'レビュー', icon: '📝' });

    ctx.logger.info(
      `game/video reviews → Volputas (${webBaseUrl ?? '未設定 = degraded'})`,
    );
  },
};

export default volputasModule;
