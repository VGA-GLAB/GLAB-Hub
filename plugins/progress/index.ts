// GLAB モジュール: progress — Calliope 進捗/スプリントの表示面
// (Calliope docs/design/glab-pm.md §H5)。
//
// エンジンは Calliope 側 (GET /api/glab/progress)。 GLAB は read して表示するだけで、
// sprint health / burndown / risk / 停滞タスクをここで再計算しないし、 自前 DB へ
// キャッシュ保存もしない (二重実装しない)。 このモジュールは `plugins/data.ts` の
// スキーマに一切触れない。
//
// Calliope 未設定・未稼働時は施設 (Aedilis) と同じ degraded 扱い: コネクタが
// 503 / 502 を返し、 パネルが「未接続」を表示する。 registerConnector により
// Calliope の health は組み込み「🟢 ステータス」タブの接続サービス一覧にも並ぶ。
//
// 接続契約 (URL env / token / レスポンス): spec/interface/calliope-connector.md

import { Hono } from '../../corpus/server/hub/sdk.ts';
import type { Context, CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { makeCalliopeConnector } from './connector.ts';
import { readProgress } from './relay.ts';

const progressModule: CorpusModule = {
  id: 'progress',
  title: '進捗',
  icon: '📈',
  setup(ctx: CorpusContext) {
    const calliope = makeCalliopeConnector((key) => ctx.env(key));
    ctx.registerConnector(calliope);

    const routes = new Hono();
    routes.get('/progress', (c: Context) => readProgress(calliope, new URL(c.req.url).search));
    ctx.registerRoute(routes);

    ctx.registerPanel({ title: '進捗', icon: '📈' });
    ctx.logger.info(`progress → Calliope (${calliope.baseUrl || '未設定 = degraded'})`);
  },
};

export default progressModule;
