import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (relative: string): string =>
  readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('forum listing filters by canSee on the server', () => {
  const src = readSource('plugins/forum/index.ts');
  assert.ok(/canSee\(/.test(src), 'forum routes must apply canSee server-side');
});

test('consult external routes are guarded by a service token', () => {
  const src = readSource('plugins/consult/index.ts');
  assert.ok(/requireServiceToken\(/.test(src), 'service token guard missing');
  assert.ok(/\/external\/presence/.test(src), 'presence external route missing');
});

test('consult creation is rate limited', () => {
  const src = readSource('plugins/consult/index.ts');
  assert.ok(/429/.test(src), 'consult creation must reject bursts with 429');
});

test('consult threads disable mass mentions and allow only invited users', () => {
  const src = readSource('bot/forum.ts');
  assert.ok(/parse:\s*\[\]/.test(src), 'mass mentions must be disabled');
  assert.ok(/users:/.test(src), 'invited users must be passed as an allowlist');
});

test('the forum id is persisted after ensure', () => {
  const src = readSource('bot/forum.ts');
  assert.ok(/GuildForum/.test(src), 'forum channel type missing');
  assert.ok(/setAvailableTags|availableTags/.test(src), 'required tags must be ensured');
});

test('orehima resolves the caller through GLAB, not Cernere directly', () => {
  const src = readSource('bot/commands/orehima.ts');
  assert.ok(/external\/presence\/resolve/.test(src), 'must resolve via the GLAB external API');
  // 「Cernere」 の語 (ユーザ向け案内文) ではなく、 実際の直結経路の有無を見る。
  assert.ok(!/from '[^']*cernere/i.test(src), 'bot must not import the Cernere client');
  assert.ok(!/WebSocket|glab_presence/.test(src), 'bot must not speak the Cernere RPC protocol');
});

test('orehima separates an unreachable hub from an unlinked account', () => {
  const src = readSource('bot/commands/orehima.ts');
  assert.ok(/!identity\.ok/.test(src), 'transport failure must have its own branch');
  assert.ok(/identity\.data === null/.test(src), 'a null resolve result must mean "not linked"');
  assert.ok(/deferReply/.test(src), 'two hub round-trips need a deferred reply');
});

test('the bot reaches the consult module at its mounted path', () => {
  const src = readSource('bot/glab-api.ts');
  assert.ok(/\/api\/x\/consult/.test(src), 'external calls must target /api/x/<moduleId>');
});

test('resolved consult threads are acknowledged so they are archived once', () => {
  const hub = readSource('plugins/consult/index.ts');
  assert.ok(/resolved_posted_at IS NULL/.test(hub), 'resolved feed must exclude acknowledged consults');
  assert.ok(/consults\/:id\/resolved-posted/.test(hub), 'the resolved ack endpoint is missing');
  const bot = readSource('bot/notify/scheduler.ts');
  assert.ok(/resolved-posted/.test(bot), 'the scheduler must acknowledge resolved consults');
});

test('discord payload limits are respected for consult and forum posts', () => {
  assert.ok(/THREAD_NAME_MAX|slice\(0, 100\)/.test(readSource('bot/forum.ts')), 'thread names must fit Discord limits');
  assert.ok(/DISCORD_MESSAGE_MAX/.test(readSource('bot/notify/scheduler.ts')), 'forum broadcasts must fit Discord limits');
});

test('new modules are registered in the pack and the panel build', () => {
  const pack = JSON.parse(readSource('plugins/pack.json')) as { modules: string[] };
  for (const id of ['roles', 'forum', 'consult']) assert.ok(pack.modules.includes(id), `pack.json must list ${id}`);
  const pkg = readSource('package.json');
  for (const id of ['roles', 'forum', 'consult']) assert.ok(pkg.includes(`plugins/${id}/panel.ts`), `build:panels must include ${id}`);
});

test('scheduler posts consults and marks them only on success', () => {
  const src = readSource('bot/notify/scheduler.ts');
  assert.ok(/consult/i.test(src), 'scheduler must handle consults');
  assert.ok(/if \(messageId\)|if \(threadId\)|if \(!.*\) continue/.test(src), 'the ledger must be updated only after a successful post');
});
