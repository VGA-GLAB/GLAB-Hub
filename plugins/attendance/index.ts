// GLAB モジュール 1: 集会出席管理 (attendance)。
//
// 出席は Aedilis + Ostiarius (会場LANゲートウェイ + passkey attestation) で記録される。
// GLAB はその記録を閲覧する Corpus コネクタ。 データは自前で持たず Aedilis を真実の源と
// する。 Aedilis 未稼働時は connector が 503 を返し、 パネルが「未接続」を表示する。
//
//   Aedilis API (DESIGN.md §7):
//     GET  /api/checkin/mine          自分の出席履歴
//     GET  /api/checkin               出席一覧 (admin、 ?facility=&from=&to=)
//     GET  /api/facilities            施設一覧 (施設名ラベル解決用)
//
// 物理チェックイン自体 (passkey タップ → attestation → POST /api/checkin/verify) は
// 会場の PWA / Ostiarius が行う。 GLAB hub は記録のレビュー面。

import { Hono, HttpServiceConnector } from '../../corpus/server/hub/sdk.ts';
import type { CorpusModule, CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { proxy } from '../shared.ts';

const attendanceModule: CorpusModule = {
  id: 'attendance',
  title: '出席',
  icon: '✅',
  setup(ctx: CorpusContext) {
    const aedilis = new HttpServiceConnector({
      id: 'aedilis',
      title: '出席 / 施設 (Aedilis)',
      scope: 'multi',
      baseUrl: ctx.env('AEDILIS_BASE_URL') ?? '',
    });
    ctx.registerConnector(aedilis);

    const r = new Hono();
    r.get('/mine', (c) => proxy(c, aedilis, '/api/checkin/mine'));
    r.get('/list', (c) => proxy(c, aedilis, '/api/checkin'));
    r.get('/facilities', (c) => proxy(c, aedilis, '/api/facilities'));
    ctx.registerRoute(r);

    ctx.registerPanel({ title: '出席', icon: '✅' });
    ctx.logger.info(
      `attendance → Aedilis (${ctx.env('AEDILIS_BASE_URL') || '未設定 = degraded'})`,
    );
  },
};

export default attendanceModule;
