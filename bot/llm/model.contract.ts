import { MODEL_ROLES, readRoleMap } from '@ludiars/one-shot';

export default {
  post: (resolved: string, model: string, transport: 'cli' | 'api'): true | string => {
    if (!MODEL_ROLES.claude.some((role) => role === model)) {
      return resolved === model || '明示されたモデル ID が変更された';
    }

    const expected = process.env[`LUDIARS_ONESHOT_MODEL_${model.toUpperCase()}`] ||
      readRoleMap()?.claude?.[model];
    if (expected) return resolved === expected || '役割とモデル ID の対応が一致しない';
    return (transport === 'cli' && resolved === model && model !== 'fable') ||
      'モデル ID が必要な呼び出しに未解決の役割名が渡された';
  },
};
