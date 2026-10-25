// GLAB launcher。
//
// GLAB は学校組織 GLAB の運営 hub。 Corpus (submodule `corpus/`) の汎用 hub
// フレームワークに、 GLAB 特化のプラグインパック (`plugins/`) を載せた派生 hub。
// このファイルは Corpus server を「GLAB パック付き」 で起動するだけの薄いランチャ。
//
//   npm run build で dist/server.js へ事前コンパイルし、その JS を node で直接起動する
//   (tsx は常駐させない。startup/runtime-paths.ts)
//     → 環境変数で plugins / data / public / port を Corpus に伝える
//     → Ex 注入値を検証し corpus/server/index.ts を起動 (Vault-only)
//
// Discord Bot は別プロセス (`bot/`)。イベントはGLAB PostgreSQLをWeb hubと共有し、
// 出席・Bot求人等のローカル運用データはSQLiteを利用する (DESIGN.md §4)。

import { resolve } from 'node:path';
import { installLogging } from './corpus/server/lib/logging.ts';
import { inspectOdeumEnvironment, requireInjectedEnvironment } from './startup/environment.ts';
import { resolveRuntimePaths } from './startup/runtime-paths.ts';
import { closeEventStore, initializeEventStore } from './plugins/events/store.ts';
import { cernereClientOwner } from './plugins/cernere/shared-owner.ts';
import { createShutdown } from './plugins/cernere/shutdown.ts';
import { memberAccessPolicy } from './plugins/access/policy.ts';
import { createPublicQuestRoutes } from './plugins/quests/public-routes.ts';
import { closeTirociniumCalls } from './plugins/tirocinium/call-routes.ts';
import {
  closeFacilityStore,
  initializeFacilityStore,
} from './plugins/events/facility-store.ts';

const { root: ROOT, pluginDir: PLUGIN_DIR } = resolveRuntimePaths(import.meta.url);

installLogging();
requireInjectedEnvironment(process.env);
// Odeum (ライブ発表) は任意機能。鍵や中継 URL が無ければ odeum だけを無効にし、
// hub 全体の起動は止めない。値は出さずにキー名だけを報告する。
const odeumEnvironment = inspectOdeumEnvironment(process.env);
if (!odeumEnvironment.enabled) {
  console.warn(`[glab] odeum disabled; missing Excubitor-injected environment: ${odeumEnvironment.missing.join(', ')}`);
}

// GLAB プラグインパック / データ / frontend の所在を Corpus に伝える
process.env.CORPUS_PLUGIN_DIR ??= PLUGIN_DIR;
process.env.CORPUS_DATA ??= resolve(ROOT, 'data');
// Serve the packaged shell, not tracked source HTML mixed with older build outputs.
// @implements SPEC-GLAB-SHELL-010
process.env.CORPUS_PUBLIC_DIR ??= resolve(ROOT, 'public/build');

// 親processの汎用CORPUS_PORTを継承しても、GLAB固有portが変わらないよう明示する。
// deploymentで変更する場合はGLAB_PORTを使い、汎用Corpusの設定とは分離する。
process.env.CORPUS_PORT = process.env.GLAB_PORT?.trim() || '5187';
process.env.CORPUS_PUBLIC_URL ??= `http://localhost:${process.env.CORPUS_PORT}`;
// ログインはパスキー一本 (neco 2026-10-15)。Cernere のパスキーは RP ID が Cernere の origin なので、
// 「パスキーで続ける」で Cernere のログイン画面へ移り、戻った authCode を /auth/exchange で GLAB origin の
// HttpOnly Cookie セッションに交換する。旧 composite (GLAB 画面内の email/password 中継) は Cernere で廃止済み。
// passkey では Corpus が CERNERE_FRONTEND_URL を必須にする (公開設定の cernereFrontendUrl)。
process.env.CORPUS_AUTH_UI_MODE = 'passkey';

// 認証の配置モード。 Corpus は無言フォールバックを禁じており未設定だと起動を拒否する
// (Corpus DESIGN §16.1)。 GLAB は Cloudflare Access のようなエッジ認証の背後には
// 置かず、 Hub 内に Cernere composite ログイン UI を埋め込むので `composite` を名乗る。
process.env.CORPUS_AUTH_MODE = 'composite';

// GLAB サーバ自身のサービス識別 (Corpus マニフェスト /.well-known/
// corpus-service.json の cernereProjectKey に使われる)。
// Cernere 側の managed project は `glab` (Cernere migration 075 /
// server/service/glab/schema.json)。実認証の credential は Excubitor が
// excubitor.catalog.yaml の cernere_launch_credentials.target_project (= 同じ key) で
// 起動直前に発行するので、ここと catalog の値は必ず一致させる。
process.env.CORPUS_SERVICE_ID = 'glab';
// hub の名乗り。 マニフェストの displayName と、 ステータスタブの自己コネクタ
// (Corpus SelfConnector) の表示名の両方に使われる。画面用ブランド表記
// (`public/src/branding.ts`) とは別の、サービスを識別する名称。
process.env.CORPUS_DISPLAY_NAME ??= 'GLab';
process.env.CORPUS_SERVICE_VERSION ??= process.env.npm_package_version ?? '0.1.0';

console.log('[glab] starting Corpus with GLAB plugin pack');
console.log(`[glab] plugins: ${process.env.CORPUS_PLUGIN_DIR}`);

let stopping = false;
const initialization = (async (): Promise<void> => {
  await initializeEventStore(process.env.GLAB_DATABASE_URL);
  if (!stopping) await initializeFacilityStore(process.env.GLAB_DATABASE_URL);
})();
// Corpus は import だけでは起動しない (Corpus spec/feature/host-cleanup.md)。startCorpus() の
// 戻り値が listen 中の server と内部資源の cleanup を持つ。request を止めてから store を閉じるため、
// 各 store の cleanup は Corpus の close (1 回だけ実行) を待ってから行う。
let corpusRuntime: { close: () => Promise<void> } | null = null;
let corpusClosing: Promise<void> | undefined;
const closeCorpus = (): Promise<void> => (corpusClosing ??= Promise.resolve().then(() => corpusRuntime?.close()));
const afterInitialization = (close: () => Promise<void>) => async (): Promise<void> => {
  // 初期化失敗そのものは下の catch で報告する。cleanup は途中確保した store にも行う。
  await initialization.catch(() => undefined);
  await closeCorpus();
  await close();
};
const shutdown = createShutdown(() => cernereClientOwner.closeAll(), [
  afterInitialization(closeEventStore), afterInitialization(closeFacilityStore),
]);
const onSignal = (): void => {
  if (stopping) return;
  stopping = true;
  closeTirociniumCalls();
  void shutdown().then(() => process.exit(0), () => process.exit(1));
};
process.on('SIGINT', onSignal);
process.on('SIGTERM', onSignal);

try {
  await initialization;
  // Corpus の standalone bootstrap は secret を再取得するため通さない。
  // GLAB の設定は Ex が注入する。Corpus CLI の env 上書きも適用しない。
  if (!stopping) {
    const { startCorpus } = await import('./corpus/server/index.ts');
    const runtime = await startCorpus({ accessPolicy: memberAccessPolicy, publicReadRoutes: createPublicQuestRoutes });
    // 起動中に停止信号が来ていたら shutdown は済んでいるので、起動し終えた Corpus をここで閉じる。
    if (stopping) await runtime.close();
    else corpusRuntime = runtime;
  }
} catch (error) {
  try { await shutdown(); }
  catch (cleanupError) { throw new AggregateError([error, cleanupError], 'GLAB initialization and cleanup failed'); }
  throw error;
}
// SIGKILL は捕捉不能。
