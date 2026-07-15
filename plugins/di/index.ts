import { Hono, HttpServiceConnector, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import {
  createDiEntryPoints,
  normalizeDiBaseUrl,
  resolveDiLaunchUrl,
} from './entry-points.ts';

const diModule: CorpusModule = {
  id: 'di',
  title: 'Di',
  icon: '💬',
  setup(ctx: CorpusContext) {
    const apiBaseUrl = normalizeDiBaseUrl(ctx.env('DISCUTERE_URL'), 'DISCUTERE_URL');
    const webBaseUrl = normalizeDiBaseUrl(
      ctx.env('DISCUTERE_WEB_URL'),
      'DISCUTERE_WEB_URL',
    ) ?? apiBaseUrl;
    const entryPoints = webBaseUrl ? createDiEntryPoints(webBaseUrl) : null;

    ctx.registerConnector(new HttpServiceConnector({
      id: 'discutere',
      title: '議論・学習 (Di)',
      scope: 'multi',
      baseUrl: apiBaseUrl ?? '',
      healthPath: '/health',
    }));

    const routes = new Hono();
    routes.get('/entry-points', (c) => {
      if (!entryPoints || !apiBaseUrl || !webBaseUrl) {
        return c.json({ error: 'di_unconfigured' }, 503);
      }
      return c.json(entryPoints);
    });
    routes.post('/discussion-launch', async (c) => {
      if (!apiBaseUrl || !webBaseUrl) return c.json({ error: 'di_unconfigured' }, 503);
      const identity = getIdentity(c);
      try {
        const response = await fetch(`${apiBaseUrl}api/integrations/glab/launch`, {
          method: 'POST',
          headers: { 'X-Cernere-User-Id': identity.userId },
        });
        const body = await response.json().catch(() => null) as { path?: unknown } | null;
        const url = response.ok ? resolveDiLaunchUrl(webBaseUrl, body?.path) : null;
        if (!url) return c.json({ error: 'di_launch_failed' }, 502);
        return c.json({ url });
      } catch {
        return c.json({ error: 'di_unavailable' }, 503);
      }
    });
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: 'Di', icon: '💬' });
    ctx.logger.info(`discussion/learning → Di (${webBaseUrl ?? '未設定 = degraded'})`);
  },
};

export default diModule;
