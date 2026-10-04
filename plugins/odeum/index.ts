// GLAB モジュール: Odeum ライブ発表 (odeum)。
//
// 発表者の画面配信は Odeum の中継 (odeum-relay) が担い、 GLab は発表セッション台帳・
// 権限・チケット発行・視聴画面を持つ (spec/feature/odeum-live-presentation.md)。
// 中継 URL や署名鍵が無いときは odeum 機能だけを無効にし、 hub の起動は止めない。

import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { ensureSchema } from '../data.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { resolveOdeumConfig } from './config.ts';
import { makeOdeumRoutes } from './routes.ts';

const odeumModule: CorpusModule = {
  id: 'odeum',
  title: 'ライブ発表',
  icon: '🎤',
  setup(ctx: CorpusContext) {
    // 台帳 (glab_odeum_sessions) を他モジュールの読み込み順に依存せず冪等初期化する。
    ensureSchema(ctx.db);
    const config = resolveOdeumConfig(ctx.env);
    // ステータス画面の接続サービス集約に中継の health を載せる。 URL 未設定時は degraded。
    ctx.registerConnector(new VersionedHttpServiceConnector({
      id: 'odeum-relay',
      title: 'ライブ発表中継 (Odeum)',
      scope: 'multi',
      baseUrl: config.relay?.httpBase ?? '',
      healthPath: '/health',
    }));
    ctx.registerRoute(makeOdeumRoutes(ctx, config));
    ctx.registerPanel({ title: 'ライブ発表', icon: '🎤' });
    if (config.disabledReason) {
      ctx.logger.warn(`odeum disabled: ${config.disabledReason}`);
    } else {
      ctx.logger.info('odeum ready (ticket signing + relay)');
    }
  },
};

export default odeumModule;
