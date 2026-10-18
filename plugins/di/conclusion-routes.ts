import { getIdentity, getUserToken, type Hono } from '../../corpus/server/hub/sdk.ts';
import { conclusionEndpoint, parsePublishedConclusions } from './conclusion-contract.ts';

export function registerConclusionRoutes(routes: Hono, base: string | null, token: string, request: typeof fetch = fetch, accessHeaders: Record<string, string> = {}): void {
  routes.get('/conclusions', async c => {
    c.header('cache-control', 'private, no-store');
    if (!getUserToken(c) || !getIdentity(c).userId) return c.json({ error: 'ログインしてください' }, 401);
    const url = base ? conclusionEndpoint(base) : null;
    if (!url || token.length < 32) return c.json({ error: '本社Diとの接続設定が必要です' }, 503);
    const id = c.req.query('id');
    if (id !== undefined) {
      if (!id || id.length > 500) return c.json({ error: 'invalid_id' }, 400);
      url.searchParams.set('id', id);
    }
    try {
      const response = await request(url, { headers: { ...accessHeaders, authorization: `Bearer ${token}`, accept: 'application/json', 'cache-control': 'no-store' },
        redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (response.status === 404) return c.json({ error: 'この議論結果は現在公開されていません' }, 404);
      if (!response.ok) return c.json({ error: 'Diの議論結果を取得できませんでした' }, 502);
      const conclusions = parsePublishedConclusions(await response.json());
      if (!conclusions || (id !== undefined && (conclusions.length !== 1 || conclusions[0]?.id !== id))) return c.json({ error: 'Diの応答を確認できませんでした' }, 502);
      return c.json({ conclusions });
    } catch {
      return c.json({ error: '本社Diに接続できませんでした' }, 503);
    }
  });
}
