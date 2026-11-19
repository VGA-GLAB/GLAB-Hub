import type { BotConfig } from './config-values.ts';

export default {
  post: (config: BotConfig, stored: Readonly<Record<string, string>>, env: NodeJS.ProcessEnv): true | string => {
    const expected = [env.GLAB_LLM_MODEL, stored.GLAB_LLM_MODEL, 'opus']
      .map((value) => value?.trim())
      .find(Boolean);
    return config.llm.model === expected || 'モデル指定の優先順位が一致しない';
  },
};
