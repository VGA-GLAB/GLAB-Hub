import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { resolveRuntimePaths, sourceDirOf } from '../startup/runtime-paths.ts';

const root = resolve('/srv/glab');
const url = (...parts: string[]): string => pathToFileURL(resolve(root, ...parts)).href;

test('compiled hub entry resolves the repo root and dist plugins', () => {
  assert.deepEqual(resolveRuntimePaths(url('dist', 'server.js')), {
    root,
    pluginDir: resolve(root, 'dist', 'plugins'),
  });
});

test('source hub entry keeps the source plugin pack', () => {
  assert.deepEqual(resolveRuntimePaths(url('server.ts')), {
    root,
    pluginDir: resolve(root, 'plugins'),
  });
});

test('compiled bot resolves back to the bot source directory', () => {
  assert.equal(sourceDirOf(url('bot', 'dist', 'index.js')), resolve(root, 'bot'));
  assert.equal(sourceDirOf(url('bot', 'config.ts')), resolve(root, 'bot'));
});

test('a js file outside dist is not treated as compiled', () => {
  assert.equal(sourceDirOf(url('scripts', 'tool.js')), resolve(root, 'scripts'));
});
