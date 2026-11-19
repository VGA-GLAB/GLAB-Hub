import { readBotConfig } from './config-store.ts';
import { resolveBotConfig, type BotConfig } from './config-values.ts';

export type { BotConfig } from './config-values.ts';

export function loadConfig(): BotConfig {
  return resolveBotConfig(readBotConfig() ?? {}, process.env);
}
