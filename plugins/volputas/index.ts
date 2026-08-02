import { Hono } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema, queueReviewRelay } from '../data.ts';
import { requireServiceToken } from '../projects/service-auth.ts';
import { normalizeHttpBaseUrl } from './entry-points.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { PRIVATE_NO_STORE, proxy } from '../shared.ts';

const GLAB_SURVEYS_PATH = '/api/v1/integrations/glab/surveys';
const GLAB_REVIEWS_PATH = '/api/v1/integrations/glab/reviews';
const GLAB_RECENT_GAMES_PATH = '/api/v1/integrations/glab/recent-games';

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
