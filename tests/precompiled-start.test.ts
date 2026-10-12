// hub / bot は事前コンパイルした JS だけで起動する (neco 2026-10-12)。
// ビルド出力を一時ディレクトリへ作り、プラグインが Corpus のローダから読める形か、
// 起動定義が tsx / npm / node --run を挟んでいないかを確かめる。サーバ自体は起動しない。

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { join, resolve } from 'node:path';
import test, { after } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
// @ts-expect-error -- ビルドスクリプトは型宣言を持たない .mjs
import { buildServer, NATIVE_EXTERNALS } from '../scripts/build-server.mjs';
// @ts-expect-error -- ビルドスクリプトは型宣言を持たない .mjs
import { buildBot } from '../scripts/build-bot.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverOut = resolve(root, 'dist-test');
const botOut = resolve(root, 'bot', 'dist-test');
after(() => {
  rmSync(serverOut, { recursive: true, force: true });
  rmSync(botOut, { recursive: true, force: true });
});

const jsFiles = (dir: string): string[] => readdirSync(dir, { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.js')).map((file) => join(dir, file));
// bundle 出力の import 文は行頭に並ぶ (複数行なら `} from "x";` で閉じる)。
// 相対 import と Node 組み込みを除いた残りが実行時に解決される npm パッケージ。
const bareImports = (files: string[]): Set<string> => new Set(files.flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(/^(?:import\b[^\n]*?|\}) from "([^"]+)";?$/gm)].map((m) => m[1])
    .filter((spec) => !spec.startsWith('.') && !isBuiltin(spec))));

test('hub build bundles every pack module behind the native externals only', async () => {
  const { modules } = await buildServer({ root, outdir: serverOut }) as { modules: string[] };
  assert.ok(existsSync(resolve(serverOut, 'server.js')));
  assert.deepEqual(readFileSync(resolve(serverOut, 'plugins/pack.json'), 'utf8'),
    readFileSync(resolve(root, 'plugins/pack.json'), 'utf8'));
  for (const id of modules) {
    assert.ok(existsSync(resolve(serverOut, 'plugins', id, 'index.js')), `${id}/index.js`);
    assert.equal(existsSync(resolve(serverOut, 'plugins', id, 'index.ts')), false, `${id} has no .ts`);
  }
  // ws の任意依存 (bufferutil / utf-8-validate) は require 経由なので import には現れない。
  assert.ok(NATIVE_EXTERNALS.includes('better-sqlite3'));
  assert.deepEqual([...bareImports(jsFiles(serverOut))].sort(), ['better-sqlite3']);
});

test('compiled plugins load as CorpusModule with matching ids', async () => {
  const pack = JSON.parse(readFileSync(resolve(serverOut, 'plugins/pack.json'), 'utf8')) as { modules: string[] };
  for (const id of pack.modules) {
    const entry = resolve(serverOut, 'plugins', id, 'index.js');
    if (!existsSync(entry)) continue;
    const mod = (await import(pathToFileURL(entry).href)) as { default?: { id?: string } };
    assert.equal(mod.default?.id, id);
  }
});

test('bot build leaves npm packages to node resolution', async () => {
  await buildBot({ root, outdir: botOut });
  assert.deepEqual([...bareImports(jsFiles(botOut))].sort(),
    ['@ludiars/encrypted-config', 'better-sqlite3', 'discord.js', 'postgres']);
});

test('start definitions run compiled JS without tsx, npm or node --run', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const bot = JSON.parse(readFileSync(resolve(root, 'bot/package.json'), 'utf8')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts.start, 'node dist/server.js');
  assert.equal(pkg.scripts.dev, undefined);
  assert.match(pkg.scripts.build, /build:panels && npm run build:server/);
  assert.equal(bot.scripts.start, 'node --env-file-if-exists=.env dist/index.js');
  assert.equal(bot.scripts.dev, undefined);
  const commands = [...readFileSync(resolve(root, 'excubitor.catalog.yaml'), 'utf8')
    .matchAll(/^\s+command: (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(commands, [
    'node dist/server.js',
    'node dist/server.js',
    'node --env-file-if-exists=.env dist/index.js',
  ]);
});
