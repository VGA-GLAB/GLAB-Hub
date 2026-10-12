// GLAB の実行時パス解決 (hub と bot で共有)。
//
// hub / bot は事前コンパイルした JS で起動する (tsx を常駐させない、neco 2026-10-12)。
// hub は `dist/server.js`、bot は `bot/dist/index.js` に 1 本へまとまるので、
// `import.meta.url` の場所はソースの場所と食い違う。ソース基準のパス (data/ や
// プラグイン) は必ずここで「コンパイル前のディレクトリ」に戻してから組み立てる。
// ソースを直接読む経路 (テスト) では自身の場所をそのまま使う。
//
// Corpus のローダは `<plugin>/index.ts` を `index.js` より優先するため、
// コンパイル後の hub はソースの `plugins/` を渡さず `dist/plugins/` を渡す。

import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_DIR = 'dist';

export interface RuntimePaths {
  /** リポジトリ root (data/ と public/ の基点)。 */
  readonly root: string;
  /** Corpus に渡すプラグインパックの root。 */
  readonly pluginDir: string;
}

function isCompiled(moduleUrl: string, here: string): boolean {
  return moduleUrl.endsWith('.js') && basename(here) === BUILD_DIR;
}

/** モジュールのコンパイル前ディレクトリ (`<dir>/dist/x.js` なら `<dir>`)。 */
export function sourceDirOf(moduleUrl: string): string {
  const here = dirname(fileURLToPath(moduleUrl));
  return isCompiled(moduleUrl, here) ? resolve(here, '..') : here;
}

export function resolveRuntimePaths(entryUrl: string): RuntimePaths {
  const here = dirname(fileURLToPath(entryUrl));
  const compiled = isCompiled(entryUrl, here);
  const root = sourceDirOf(entryUrl);
  return {
    root,
    pluginDir: compiled ? resolve(root, BUILD_DIR, 'plugins') : resolve(root, 'plugins'),
  };
}
