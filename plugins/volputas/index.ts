import { Hono, getIdentity, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { ensureSchema, queueReviewRelay } from '../data.ts';
import { parseCreatedReview, relayFromCreatedReview } from './review-relay.ts';

import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { normalizeHttpBaseUrl, proxy, proxyStream } from '../shared.ts';

const GLAB_SURVEYS_PATH = '/api/v1/integrations/glab/surveys';
const GLAB_REVIEWS_PATH = '/api/v1/integrations/glab/reviews';
const GLAB_RECENT_GAMES_PATH = '/api/v1/integrations/glab/recent-games';
const GLAB_GAMES_PATH = '/api/v1/integrations/glab/games';
const GLAB_EVIDENCE_PATH = '/api/v1/integrations/glab/evidence';

const volputasModule: CorpusModule = {
  id: 'volputas',
  title: 'レビュー',
  icon: '📝',
  setup(ctx: CorpusContext) {
    // 感想リレー (POST /reviews の proxy 応答から glab_review_relay へキュー) が
    // 同テーブルを使うため、 他モジュールの読み込み順に依存せず自分で冪等初期化する
    // (data.ts の規約)。
    ensureSchema(ctx.db);
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
    // 感想系の中継。 proxy() が全応答に cache-control: private, no-store を付ける。
    // @implements SPEC-VOLPUTAS-REVIEWS-004
    routes.get('/reviews', (c) => proxy(
      c, connector, GLAB_REVIEWS_PATH, ctx.tokenProvider, 'volputas',
    ));
    // 投稿は Volputas に保存させ、 201 で返った record を GLAB が自分でリレー
    // キューに積む。 感想の入口は GLAB (認証フロント) だけなので、 Volputas から
    // GLAB への折り返し (service token) は持たない。 キュー失敗で投稿を失敗にしない。
    routes.post('/reviews', async (c) => {
      const response = await proxy(c, connector, GLAB_REVIEWS_PATH, ctx.tokenProvider, 'volputas');
      if (response.status !== 201) return response;
      const record = parseCreatedReview(await response.clone().json().catch(() => null));
      if (!record) {
        ctx.logger.warn('review relay skipped: unexpected Volputas response shape');
        return response;
      }
      const relay = relayFromCreatedReview(record, {
        authorDisplayName: getIdentity(c).displayName,
        publicUrl: ctx.env('CORPUS_PUBLIC_URL'),
      });
      if (!relay) {
        if (record.visibility === 'community') {
          ctx.logger.warn(`review relay skipped (${record.id}): CORPUS_PUBLIC_URL is not set`);
        }
        return response;
      }
      try {
        queueReviewRelay(ctx.db, relay);
      } catch (error) {
        ctx.logger.warn(`review relay enqueue failed (${record.id}): ${error instanceof Error ? error.message : String(error)}`);
      }
      return response;
    });
    routes.get('/recent-games', (c) => proxy(
      c, connector, GLAB_RECENT_GAMES_PATH, ctx.tokenProvider, 'volputas',
    ));

    // ゲームマスタ。 一覧は全員、 登録と更新は管理者だけ。 requireAdmin は
    // 画面と操作を出すかどうかの判断で、 権限の正本は Volputas 側が
    // Cernere token の role で見る (GLAB を迂回されても書けない)。
    routes.get('/games', (c) => {
      // 非公開ゲームの列挙は管理 UI だけに許可する。任意のクエリをそのまま
      // Volputas へ渡すこの中継で includeInactive を許すと、画面を経由せず
      // 停止中のゲームを取得できてしまう。
      if (c.req.query('includeInactive') !== undefined) {
        return c.json({ error: 'admin_required' }, 403);
      }
      return proxy(c, connector, GLAB_GAMES_PATH, ctx.tokenProvider, 'volputas');
    });
    routes.get('/games/admin', requireAdmin, (c) => proxy(
      c, connector, `${GLAB_GAMES_PATH}?includeInactive=true`, ctx.tokenProvider, 'volputas',
    ));
    routes.post('/games', requireAdmin, (c) => proxy(
      c, connector, GLAB_GAMES_PATH, ctx.tokenProvider, 'volputas',
    ));
    routes.patch('/games/:id', requireAdmin, (c) => proxy(
      c,
      connector,
      `${GLAB_GAMES_PATH}/${encodeURIComponent(c.req.param('id'))}`,
      ctx.tokenProvider,
      'volputas',
    ));

    // アンケート定義の登録と公開切替 (ゲーム別アンケート)。
    routes.post('/surveys', requireAdmin, (c) => proxy(
      c, connector, GLAB_SURVEYS_PATH, ctx.tokenProvider, 'volputas',
    ));
    routes.patch('/surveys/:id', requireAdmin, (c) => proxy(
      c,
      connector,
      `${GLAB_SURVEYS_PATH}/${encodeURIComponent(c.req.param('id'))}`,
      ctx.tokenProvider,
      'volputas',
    ));

    // 感情曲線。 記録と評価は JSON だが、 動画とゲームログはバイナリなので
    // 中継の経路を分ける (proxy() は本文を文字列化してしまう)。
    routes.get('/evidence/emotion-curves', (c) => proxy(
      c, connector, `${GLAB_EVIDENCE_PATH}/emotion-curves`, ctx.tokenProvider, 'volputas',
    ));
    routes.post('/evidence/emotion-curves', (c) => proxy(
      c, connector, `${GLAB_EVIDENCE_PATH}/emotion-curves`, ctx.tokenProvider, 'volputas',
    ));
    routes.post('/evidence/emotion-curves/:recordId/evaluate', (c) => proxy(
      c,
      connector,
      `${GLAB_EVIDENCE_PATH}/emotion-curves/${encodeURIComponent(c.req.param('recordId'))}/evaluate`,
      ctx.tokenProvider,
      'volputas',
    ));
    routes.get('/evidence/media/:kind/:recordId/ticket', (c) => proxy(
      c,
      connector,
      `${GLAB_EVIDENCE_PATH}/media/${encodeURIComponent(c.req.param('kind'))}`
        + `/${encodeURIComponent(c.req.param('recordId'))}/ticket`,
      ctx.tokenProvider,
      'volputas',
    ));
    routes.put('/evidence/media/:kind/:recordId', (c) => proxyStream(
      c,
      connector,
      `${GLAB_EVIDENCE_PATH}/media/${encodeURIComponent(c.req.param('kind'))}`
        + `/${encodeURIComponent(c.req.param('recordId'))}`,
      ctx.tokenProvider,
      'volputas',
    ));
    // 再生。 <video> が直接引くのでチケット (クエリ文字列) が認可を担う。
    routes.get('/evidence/media/:kind/:recordId', (c) => proxyStream(
      c,
      connector,
      `${GLAB_EVIDENCE_PATH}/media/${encodeURIComponent(c.req.param('kind'))}`
        + `/${encodeURIComponent(c.req.param('recordId'))}`,
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
