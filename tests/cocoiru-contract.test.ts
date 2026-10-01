import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (relative: string): string =>
  readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('cocoiru accepts only the glab group', () => {
  const src = readSource('plugins/cocoiru/index.ts');
  assert.ok(/GROUP_ID = 'glab'/.test(src), "groupId must be limited to 'glab'");
  assert.ok(/\/resident\/:groupId\//.test(src), 'routes must live under /resident/:groupId');
  assert.ok(/404/.test(src), 'unknown groups must be rejected with 404');
});

test('cocoiru rejects unavailable recipients and bursts', () => {
  const src = readSource('plugins/cocoiru/index.ts');
  assert.ok(/409/.test(src), 'calls to members without a lease must return 409');
  assert.ok(/429/.test(src), 'call and tasukete bursts must return 429');
});

test('cocoiru lobby secret is never cached', () => {
  const src = readSource('plugins/cocoiru/index.ts');
  assert.ok(/no-store/.test(src), 'discord-lobby must send Cache-Control: private, no-store');
});

test('cocoiru keeps SQL in the store and imports the hub through the sdk', () => {
  const src = readSource('plugins/cocoiru/index.ts');
  assert.ok(/corpus\/server\/hub\/sdk\.ts/.test(src), 'runtime imports must go through the sdk');
  assert.ok(!/from 'hono'/.test(src), 'hono must not be imported directly');
  assert.ok(!/prepare\(/.test(src), 'SQL belongs in plugins/cocoiru/store.ts');
  const pack = JSON.parse(readSource('plugins/pack.json')) as { modules: string[] };
  assert.ok(pack.modules.includes('cocoiru'), 'pack.json must list cocoiru');
});
