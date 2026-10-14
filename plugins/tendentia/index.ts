// トレンドタブ — Tendentia (Td) のトレンドマップを GLab に載せる。
//
// Td は閲覧だけなら誰でも読める (同じ端末から / 公開 URL)。GLab は利用者の
// 代わりに Td を読み、表示に要る列だけへ射影して返す (map-contract.ts)。
// 好みの記録 (興味・開いた記録) は Td の本人ログインに閉じているので、ここでは
// 書き込み系 (click / interest) を中継しない。全体表示を見せ、本人向けのマップは
// Td を開いてもらう。

import { Hono } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { normalizeHttpBaseUrl, PRIVATE_NO_STORE } from '../shared.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { sanitizeTendentiaMap } from './map-contract.ts';

const MAP_PATH = 'api/trend-crawler/map';
const FETCH_TIMEOUT_MS = 10_000;

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': PRIVATE_NO_STORE } });
}

const tendentiaModule: CorpusModule = {
  id: 'tendentia',
  title: 'トレンド',
  icon: '📈',
  setup(ctx: CorpusContext) {
    const apiBaseUrl = normalizeHttpBaseUrl(ctx.env('TENDENTIA_URL'), 'TENDENTIA_URL');
    const publicUrl = normalizeHttpBaseUrl(ctx.env('TENDENTIA_PUBLIC_URL'), 'TENDENTIA_PUBLIC_URL');

    ctx.registerConnector(new VersionedHttpServiceConnector({
      id: 'tendentia',
      title: 'トレンド (Td)',
      scope: 'multi',
      baseUrl: apiBaseUrl ?? '',
      healthPath: '/health',
    }));

    const routes = new Hono();
    routes.get('/entry-points', () => jsonResponse({ publicUrl }));
    routes.get('/map', async () => {
      if (!apiBaseUrl) return jsonResponse({ error: 'tendentia_unconfigured' }, 503);
      try {
        const response = await fetch(new URL(MAP_PATH, apiBaseUrl), {
          headers: { accept: 'application/json' },
          redirect: 'error',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!response.ok) return jsonResponse({ error: 'tendentia_map_failed' }, 502);
        const view = sanitizeTendentiaMap(await response.json().catch(() => null));
        if (!view) return jsonResponse({ error: 'tendentia_map_invalid' }, 502);
        return jsonResponse(view);
      } catch {
        return jsonResponse({ error: 'tendentia_unavailable' }, 503);
      }
    });
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: 'トレンド', icon: '📈' });
    ctx.logger.info(`trends → Tendentia (${apiBaseUrl ?? '未設定 = degraded'})`);
  },
};

export default tendentiaModule;
