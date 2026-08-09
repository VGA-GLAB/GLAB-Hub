import { Hono, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema, queueReviewRelay } from '../data.ts';
import { requireServiceToken } from '../projects/service-auth.ts';
import { normalizeHttpBaseUrl } from './entry-points.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { PRIVATE_NO_STORE, proxy, proxyStream } from '../shared.ts';

const GLAB_SURVEYS_PATH = '/api/v1/integrations/glab/surveys';
const GLAB_REVIEWS_PATH = '/api/v1/integrations/glab/reviews';
const GLAB_RECENT_GAMES_PATH = '/api/v1/integrations/glab/recent-games';
const GLAB_GAMES_PATH = '/api/v1/integrations/glab/games';
const GLAB_EVIDENCE_PATH = '/api/v1/integrations/glab/evidence';

const reviewRelaySchema = z.object({
  reviewId: z.string().min(1).max(200),
  projectId: z.string().nullable(),
  gameTitle: z.string().min(1).max(200),
  recommend: z.boolean().nullable(),
  excerpt: z.string().min(1).max(2_000),
  author: z.string().min(1).max(100),
  // 長さ上限は全項目に付ける。 Discord カードの整形前に、 保存量と
  // 1 メッセージ上限 (2,000) を受け口の時点で有界にしておく。
  url: z.string().url().max(500),
}).strict();

const volputasModule: CorpusModule = {
  id: 'volputas',
  title: 'レビュー',
  icon: '📝',
  setup(ctx: CorpusContext) {
    // 感想リレーの受け口が glab_review_relay を使うため、 他モジュールの
    // 読み込み順に依存せず自分で冪等初期化する (data.ts の規約)。
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
    routes.post('/reviews', (c) => proxy(
      c, connector, GLAB_REVIEWS_PATH, ctx.tokenProvider, 'volputas',
    ));
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
    routes.post(
      '/external/review-relay',
      requireServiceToken(ctx.env('GLAB_PROJECTS_SERVICE_TOKEN')),
      async (c) => {
        const parsed = reviewRelaySchema.safeParse(await c.req.json().catch(() => null));
        if (!parsed.success) {
          return c.json(
            { error: 'invalid_review_relay', fields: parsed.error.flatten().fieldErrors },
            400,
            { 'cache-control': PRIVATE_NO_STORE },
          );
        }
        const queued = queueReviewRelay(ctx.db, parsed.data);
        return c.json(
          queued ? { queued: true } : { queued: false, reason: 'already-queued' },
          queued ? 201 : 200,
          { 'cache-control': PRIVATE_NO_STORE },
        );
      },
    );
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: 'レビュー', icon: '📝' });
    ctx.logger.info(
      `survey catalog → Volputas, responses → Cernere (${apiBaseUrl ?? '未設定 = degraded'})`,
    );
  },
};

export default volputasModule;
