// hub サーバを事前コンパイルする (tsx を常駐させない、neco 2026-10-12)。
//
//   node scripts/build-server.mjs            → dist/
//
// server.ts と各プラグインの index.ts を 1 回の esbuild で entry にし、共有部分を
// chunk に分ける (splitting)。Corpus の sdk.ts / hono は 1 chunk にだけ入るので、
// Corpus が実行時に dynamic import するプラグインと hub 本体が同じインスタンスを掴む
// (CLAUDE.md「hono 二重ロード回避」を bundle 後も保つ)。
//
// better-sqlite3 はネイティブ addon なので bundle せず、root の node_modules から読む。
// ws の任意依存 (bufferutil / utf-8-validate) は未導入のまま require 失敗を許す。
// プラグインの panel.js など .ts 以外のファイルは dist/plugins/<id>/ へ写す
// (Corpus が module dir から静的配信する)。

import { build } from 'esbuild';
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NATIVE_EXTERNALS = ['better-sqlite3', 'bufferutil', 'utf-8-validate'];

// bundle に入った CJS 依存が node 組み込みを require できるようにする。
const REQUIRE_BANNER =
  "import { createRequire as __glabCreateRequire } from 'node:module';" +
  'const require = __glabCreateRequire(import.meta.url);';

export function readPackModules(root) {
  const pack = JSON.parse(readFileSync(resolve(root, 'plugins/pack.json'), 'utf8'));
  return pack.modules.filter((id) => existsSync(resolve(root, 'plugins', id, 'index.ts')));
}

export function serverEntryPoints(root, modules) {
  const entries = { server: resolve(root, 'server.ts') };
  for (const id of modules) entries[`plugins/${id}/index`] = resolve(root, 'plugins', id, 'index.ts');
  return entries;
}

export function copyPluginAssets(root, outdir, modules) {
  cpSync(resolve(root, 'plugins/pack.json'), resolve(outdir, 'plugins/pack.json'));
  for (const id of modules) {
    cpSync(resolve(root, 'plugins', id), resolve(outdir, 'plugins', id), {
      recursive: true,
      filter: (source) => !source.endsWith('.ts'),
    });
  }
}

export async function buildServer({ root, outdir = resolve(root, 'dist') }) {
  rmSync(outdir, { recursive: true, force: true });
  const modules = readPackModules(root);
  await build({
    entryPoints: serverEntryPoints(root, modules),
    outdir,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    chunkNames: 'chunks/[name]-[hash]',
    external: NATIVE_EXTERNALS,
    banner: { js: REQUIRE_BANNER },
    logLevel: 'warning',
  });
  copyPluginAssets(root, outdir, modules);
  return { outdir, modules };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { outdir, modules } = await buildServer({ root });
  console.log(`[build-server] ${outdir} (server + ${modules.length} plugins)`);
}
