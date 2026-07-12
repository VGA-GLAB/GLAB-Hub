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
// Discord Bot は別プロセス (`bot/`)。 Corpus と同じ `data/corpus.db` を WAL 共有して
// イベント / 就活情報を Web hub と双方向にやりとりする (DESIGN.md §4)。

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

// GLAB プラグインパック / データ / frontend の所在を Corpus に伝える
process.env.CORPUS_PLUGIN_DIR ??= resolve(ROOT, 'plugins');
process.env.CORPUS_DATA ??= resolve(ROOT, 'data');
process.env.CORPUS_PUBLIC_DIR ??= resolve(ROOT, 'corpus', 'public');

// 親processの汎用CORPUS_PORTを継承しても、GLAB固有portが変わらないよう明示する。
// deploymentで変更する場合はGLAB_PORTを使い、汎用Corpusの設定とは分離する。
process.env.CORPUS_PORT = process.env.GLAB_PORT?.trim() || '5187';
process.env.CORPUS_PUBLIC_URL ??= `http://localhost:${process.env.CORPUS_PORT}`;
// GLab はパスワード認証を公開せず、Cernere-hosted passkey popup のみを使う。
process.env.CORPUS_AUTH_UI_MODE = 'passkey';

// GLAB サーバ自身のサービス識別 (Corpus マニフェスト /.well-known/
// corpus-service.json と Cernere project key に使われる)。
process.env.CORPUS_SERVICE_ID ??= 'glab';
process.env.CORPUS_DISPLAY_NAME ??= 'GLAB';

console.log('[glab] starting Corpus with GLAB plugin pack');
console.log(`[glab] plugins: ${process.env.CORPUS_PLUGIN_DIR}`);

await import('./corpus/server/bootstrap.ts');
