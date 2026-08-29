import { Hono, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { createDiEntryPoints, resolveDiLaunchUrl } from './entry-points.ts';
import { sanitizeDiReviewTrends } from './review-trend-contract.ts';
import { normalizeHttpBaseUrl, PRIVATE_NO_STORE } from '../shared.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';

const diModule: CorpusModule = {
  id: 'di',
  title: 'Di',
  icon: '💬',
  setup(ctx: CorpusContext) {
    const apiBaseUrl = normalizeHttpBaseUrl(ctx.env('DISCUTERE_URL'), 'DISCUTERE_URL');
    const webBaseUrl = normalizeHttpBaseUrl(
      ctx.env('DISCUTERE_WEB_URL'),
      'DISCUTERE_WEB_URL',
    ) ?? apiBaseUrl;
    const entryPoints = webBaseUrl ? createDiEntryPoints(webBaseUrl) : null;

    ctx.registerConnector(new VersionedHttpServiceConnector({
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
    routes.get('/review-trends', async (c) => {
      if (!apiBaseUrl) {
        return Response.json(
          { error: 'di_unconfigured' },
          { status: 503, headers: { 'cache-control': PRIVATE_NO_STORE } },
        );
      }
      try {
        const response = await fetch(`${apiBaseUrl}api/integrations/glab/review-trends`, {
          headers: { accept: 'application/json' },
        });
        if (!response.ok) {
          return Response.json(
            { error: 'di_review_trends_failed' },
            { status: 502, headers: { 'cache-control': PRIVATE_NO_STORE } },
          );
        }
        const payload = sanitizeDiReviewTrends(await response.json().catch(() => null));
        if (!payload) {
          return Response.json(
            { error: 'di_review_trends_invalid' },
            { status: 502, headers: { 'cache-control': PRIVATE_NO_STORE } },
          );
        }
        return Response.json(payload, {
          headers: { 'cache-control': PRIVATE_NO_STORE },
        });
      } catch {
        return Response.json(
          { error: 'di_unavailable' },
          { status: 503, headers: { 'cache-control': PRIVATE_NO_STORE } },
        );
      }
    });
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: 'Di', icon: '💬' });
    ctx.logger.info(`discussion/learning → Di (${webBaseUrl ?? '未設定 = degraded'})`);
  },
};

export default diModule;
