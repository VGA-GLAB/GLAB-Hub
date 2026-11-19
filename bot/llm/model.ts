import { MODEL_ROLES, resolveModel } from '@ludiars/one-shot';
import { contract } from '#glab-contract-runtime'; /* augur-inject:import:9b7a782b */
import augurContract_89f1e806 from './model.contract.ts'; /* augur-inject:contract-predicate:d54c27d6 */

export function resolveClaudeModel(model: string, transport: 'cli' | 'api'): string {
  if (!MODEL_ROLES.claude.some((role) => role === model)) return model;

  const resolved = resolveModel(model, 'claude');
  // Lapilli can fall back to Claude Code aliases, which the Messages API cannot use.
  if (transport === 'api' && resolved === model) {
    throw new Error(`Claude モデルの役割 ${model} を解決できません。LUDIARS_MODEL_ROLES_FILE を確認してください。`);
  }
  return resolved;
}
// @ts-expect-error augur-inject
resolveClaudeModel = contract(resolveClaudeModel, { ...augurContract_89f1e806, contractId: 'C-17', mode: 'observe', sample: 1, where: 'bot/llm/model.ts:3', rule: 'contract-wrap', id: '89f1e806' }); /* augur-inject:contract-wrap:89f1e806 */
