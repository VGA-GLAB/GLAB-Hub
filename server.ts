// GLAB launcher。
//
// GLAB は学校組織 GLAB の運営 hub。 Corpus (submodule `corpus/`) の汎用 hub
// フレームワークに、 GLAB 特化のプラグインパック (`plugins/`) を載せた派生 hub。
// このファイルは Corpus server を「GLAB パック付き」 で起動するだけの薄いランチャ。
//
//   tsx server.ts
//     → 環境変数で plugins / data / public / port を Corpus に伝える
//     → corpus/server/bootstrap.ts を起動 (Infisical bootstrap → index.ts)
//
// Discord Bot は別プロセス (`bot/`)。イベントはGLAB PostgreSQLをWeb hubと共有し、
// 出席・Bot求人等のローカル運用データはSQLiteを利用する (DESIGN.md §4)。

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeEventStore, initializeEventStore } from './plugins/events/store.ts';
import {
  closeFacilityStore,
  initializeFacilityStore,
} from './plugins/events/facility-store.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));

// GLAB プラグインパック / データ / frontend の所在を Corpus に伝える
process.env.CORPUS_PLUGIN_DIR ??= resolve(ROOT, 'plugins');
process.env.CORPUS_DATA ??= resolve(ROOT, 'data');
// frontend は GLab 自前 (`public/`)。 Corpus のシェルは公開向けの汎用 hub なので、
// 名乗り・シェル・スタイルは GLab 側が持つ (`public/src/branding.ts`)。
process.env.CORPUS_PUBLIC_DIR ??= resolve(ROOT, 'public');

// 親processの汎用CORPUS_PORTを継承しても、GLAB固有portが変わらないよう明示する。
// deploymentで変更する場合はGLAB_PORTを使い、汎用Corpusの設定とは分離する。
process.env.CORPUS_PORT = process.env.GLAB_PORT?.trim() || '5187';
process.env.CORPUS_PUBLIC_URL ??= `http://localhost:${process.env.CORPUS_PORT}`;
// GLAB内蔵UI → Corpus backend → project認証済みCernere backend の経路に固定する。
// Cernere frontendへのredirectは行わず、セッションはGLAB originのHttpOnly Cookieで保持する。
process.env.CORPUS_AUTH_UI_MODE = 'composite';

// GLAB サーバ自身のサービス識別 (Corpus マニフェスト /.well-known/
// corpus-service.json の cernereProjectKey に使われる)。
// Cernere 側の managed project は `EducationLab` (Cernere migration 027 /
// server/service/education-lab/schema.json)。実認証の credential は Excubitor が
// excubitor.catalog.yaml の cernere_launch_credentials.target_project (= 同じ key) で
// 起動直前に発行するので、ここと catalog の値は必ず一致させる。
process.env.CORPUS_SERVICE_ID ??= 'EducationLab';
process.env.CORPUS_DISPLAY_NAME ??= 'GLAB';
process.env.CORPUS_SERVICE_VERSION ??= process.env.npm_package_version ?? '0.1.0';

console.log('[glab] starting Corpus with GLAB plugin pack');
console.log(`[glab] plugins: ${process.env.CORPUS_PLUGIN_DIR}`);

await initializeEventStore(process.env.GLAB_DATABASE_URL);
await initializeFacilityStore(process.env.GLAB_DATABASE_URL);
const shutdown = async (): Promise<void> => {
  await Promise.all([closeEventStore(), closeFacilityStore()]);
};
process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

await import('./corpus/server/bootstrap.ts');
