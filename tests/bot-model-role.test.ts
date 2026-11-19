import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { resolveBotConfig } from '../bot/config-values.ts';
import { AnthropicClient } from '../bot/llm/anthropic.ts';
import { resolveClaudeModel } from '../bot/llm/model.ts';

const mappedModel = 'claude-opus-mapped';
const explicitModel = 'claude-opus-operator-choice';

test('selects the Bot model from its environment, saved settings, or default role', () => {
  const stored = { GLAB_LLM_MODEL: ` ${explicitModel} ` };
  assert.equal(resolveBotConfig({}, {}).llm.model, 'opus');
  assert.equal(resolveBotConfig({ GLAB_LLM_MODEL: ' ' }, { GLAB_LLM_MODEL: ' ' }).llm.model, 'opus');
  assert.equal(resolveBotConfig(stored, { GLAB_LLM_MODEL: ' ' }).llm.model, explicitModel);
  assert.equal(resolveBotConfig(stored, { GLAB_LLM_MODEL: ' sonnet ' }).llm.model, 'sonnet');
});

test('resolves Claude roles at the transport boundary and preserves model overrides', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'glab-model-roles-'));
  const roleMap = join(dir, 'model-roles.json');
  const keys = ['LUDIARS_MODEL_ROLES_FILE', 'LUDIARS_ONESHOT_MODEL_OPUS'] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(roleMap, { force: true });
    rmdirSync(dir);
  });
  delete process.env.LUDIARS_ONESHOT_MODEL_OPUS;
  process.env.LUDIARS_MODEL_ROLES_FILE = roleMap;
  writeFileSync(roleMap, JSON.stringify({ schemaVersion: 1, roles: { claude: { opus: mappedModel } } }));

  const config = resolveBotConfig({}, { ANTHROPIC_API_KEY: 'test-key' });
  assert.equal(resolveClaudeModel(config.llm.model, 'cli'), mappedModel);
  assert.equal(resolveClaudeModel(explicitModel, 'cli'), explicitModel);

  const sentModels: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    sentModels.push(JSON.parse(String(init.body)).model);
    return Response.json({ content: [{ type: 'text', text: 'ok' }] });
  });

  const client = new AnthropicClient(config);
  const args = { system: '', messages: [], maxTokens: 1 };
  await client.invoke({ ...args, model: config.llm.model });
  await client.invoke({ ...args, model: explicitModel });
  assert.deepEqual(sentModels, [mappedModel, explicitModel]);

  process.env.LUDIARS_MODEL_ROLES_FILE = join(dir, 'missing.json');
  assert.equal(resolveClaudeModel('opus', 'cli'), 'opus');
  await assert.rejects(client.invoke({ ...args, model: 'opus' }), /LUDIARS_MODEL_ROLES_FILE/);
  assert.equal(sentModels.length, 2);
});
