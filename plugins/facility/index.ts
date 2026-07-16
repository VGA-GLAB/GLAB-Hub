// GLAB モジュール 2: 施設予約 (facility)。
//
// データを自前で持たず、 施設予約サービス Aedilis のバックエンドへ接続して集約表示する
// (Corpus のコネクタ流儀)。 Aedilis 未稼働時は connector が 503 を返し、 パネルが
// 「未接続」を表示する degraded モードで起動する。
//
//   Aedilis API (DESIGN.md §7):
//     GET    /api/facilities             施設一覧
//     GET    /api/reservations           予約一覧 (?facility=&from=&to=)
//     GET    /api/reservations/mine      自分の予約
//     POST   /api/reservations           新規予約 {facilityId,startAt,endAt,purpose?}
//     DELETE /api/reservations/:id        予約キャンセル

import { Hono } from '../../corpus/server/hub/sdk.ts';
import type { CorpusModule, CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { proxy } from '../shared.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';

const facilityModule: CorpusModule = {
  id: 'facility',
  title: '施設',
  icon: '🏫',
  setup(ctx: CorpusContext) {
    const aedilis = new VersionedHttpServiceConnector({
      id: 'aedilis',
      title: '施設予約 (Aedilis)',
      scope: 'multi',
      baseUrl: ctx.env('AEDILIS_BASE_URL') ?? '',
      healthPath: '/api/health',
    });
    ctx.registerConnector(aedilis);

    const r = new Hono();
    r.get('/facilities', (c) => proxy(c, aedilis, '/api/facilities', ctx.tokenProvider));
    r.get('/facilities/:id', (c) => proxy(
      c,
      aedilis,
      `/api/facilities/${encodeURIComponent(c.req.param('id'))}`,
      ctx.tokenProvider,
    ));
    r.get('/reservations', (c) => proxy(c, aedilis, '/api/reservations', ctx.tokenProvider));
    r.get('/reservations/mine', (c) => proxy(
      c,
      aedilis,
      '/api/reservations/mine',
      ctx.tokenProvider,
    ));
    r.post('/reservations', (c) => proxy(c, aedilis, '/api/reservations', ctx.tokenProvider));
    r.delete('/reservations/:id', (c) =>
      proxy(c, aedilis, `/api/reservations/${encodeURIComponent(c.req.param('id'))}`, ctx.tokenProvider),
    );
    ctx.registerRoute(r);

    ctx.registerPanel({ title: '施設', icon: '🏫' });
    ctx.logger.info(
      `facility → Aedilis (${ctx.env('AEDILIS_BASE_URL') || '未設定 = degraded'})`,
    );
  },
};

export default facilityModule;
