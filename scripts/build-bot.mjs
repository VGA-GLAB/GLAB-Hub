// Discord bot を事前コンパイルする (tsx を常駐させない、neco 2026-10-12)。
//
//   node scripts/build-bot.mjs               → bot/dist/index.js
//
// bot/index.ts から辿れる自前コード (bot/ と plugins/ の共有モジュール) だけを 1 本へまとめ、
// npm パッケージは bundle しない。出力の bot/dist/ から Node が bot/node_modules →
// root の node_modules の順に解決するので、discord.js / better-sqlite3 は bot 側、
// plugins/ が使う postgres / zod は root 側の導入をそのまま使う。

import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function buildBot({ root, outdir = resolve(root, 'bot/dist') }) {
  rmSync(outdir, { recursive: true, force: true });
  await build({
    entryPoints: { index: resolve(root, 'bot/index.ts') },
    outdir,
    bundle: true,
    packages: 'external',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    sourcemap: true,
    logLevel: 'warning',
  });
  return { outdir };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { outdir } = await buildBot({ root });
  console.log(`[build-bot] ${outdir}`);
}
