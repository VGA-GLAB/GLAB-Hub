// Discord は通知先だけに縮退した (spec/interface/discord-commands.md)。
// 入力境界は「登録が空」「dispatch しない」の 2 点で成立するので、 退行を検出できるよう固定する。

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const text = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the slash command registry is empty', async () => {
  const src = await text('bot/commands/registry.ts');
  assert.match(
    src,
    /export const ALL_COMMANDS:\s*readonly BotCommand\[\]\s*=\s*\[\]/,
    '正本の command 一覧は空であること',
  );
  // 旧 handler はソースとして残るが、 registry から再び繋がってはいけない。
  assert.ok(
    !/from '\.\/(event|job|chat|orehima)\.ts'/.test(src),
    'registry は廃止した command handler を import しないこと',
  );
});

test('command deletion covers the guild scope even if the global sync fails', async () => {
  const src = await text('bot/commands/registry.ts');
  assert.match(src, /applicationCommands\(/, 'global scope を同期すること');
  assert.match(src, /applicationGuildCommands\(/, 'guild scope を同期すること');
  // guild command は即時反映される = 利用者に見え続けるので、 global の失敗で落とさない。
  assert.match(src, /catch/, '各 scope の失敗を捕捉すること');
  assert.match(src, /throw new AggregateError/, '失敗した scope があれば呼び出し元へ伝えること');
});

test('the bot does not dispatch Discord input into GLAB', async () => {
  const index = await text('bot/index.ts');
  // Chat Input は固定案内だけを返す。
  assert.match(index, /replyToDisabledCommand\(interaction\)/);
  assert.ok(!/ALL_COMMANDS/.test(index), 'entrypoint は command を dispatch しないこと');
  assert.ok(!/createLlmClient|CommandDeps/.test(index), '通知 runtime は LLM / command 依存を持たないこと');
  // Button / Modal 等の別入力経路を後から生やしていないこと。
  assert.ok(
    !/isButton|isModalSubmit|isAnySelectMenu|isContextMenu/.test(index),
    'Chat Input 以外の入力 handler を登録しないこと',
  );
  assert.equal(
    index.match(/Events\.InteractionCreate/g)?.length,
    1,
    'InteractionCreate の購読は 1 箇所だけであること',
  );

  const disabled = await text('bot/commands/disabled-interaction.ts');
  assert.ok(
    !/\bdb\b|glabExternal|LlmClient/.test(disabled),
    '停止案内は DB / GLAB API / LLM を呼ばないこと',
  );
  assert.match(disabled, /MessageFlags\.Ephemeral/, '案内は ephemeral で返すこと');
});
