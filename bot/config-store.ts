// GLAB Bot ローカル暗号化 config ストア。
//
// @ludiars/encrypted-config (AES-256-GCM + scrypt、 Canalis/Tirocinium 方式) の
// GLAB 専用ラッパー。 保存先はリポ直下 (cwd) `glab-bot.config.json` (gitignore 済)。
// token / API キーは暗号化、 その他 (channel id / backend 等) は平文で保存する。
// master 鍵は env GLAB_BOT_MASTER_KEY → マシン束縛値 (glab-bot:hostname:user)。

import {
  readConfig,
  setConfig,
  deleteConfig,
  resolveConfigPath,
  type ResolvedConfig,
  type StoreOptions,
} from '@ludiars/encrypted-config';

/** 暗号化保存するキー (それ以外は plain 保存)。 接続文字列は資格情報を含むため暗号化する。 */
export const GLAB_BOT_SECRET_KEYS = new Set([
  'DISCORD_TOKEN',
  'ANTHROPIC_API_KEY',
  'GLAB_DATABASE_URL',
]);

/** config-setup / 起動時に扱う全キー (表示順)。 */
export const GLAB_BOT_CONFIG_KEYS: readonly string[] = [
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'GLAB_DATABASE_URL',
  'GLAB_EVENT_CHANNEL_ID',
  'GLAB_JOB_CHANNEL_ID',
  'GLAB_ADMIN_USER_IDS',
  'GLAB_LLM_BACKEND',
  'GLAB_LLM_MODEL',
  'ANTHROPIC_API_KEY',
];

const STORE_OPTS: StoreOptions = {
  secretKeys: GLAB_BOT_SECRET_KEYS,
  configPathEnv: 'GLAB_BOT_CONFIG_PATH',
  masterKeyEnv: 'GLAB_BOT_MASTER_KEY',
  defaultConfigFile: 'glab-bot.config.json',
  masterSecretPrefix: 'glab-bot',
};

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return resolveConfigPath(STORE_OPTS, env);
}

/** 全 config を平文 map として読む (secret は復号済み)。 未作成時は null。 */
export function readBotConfig(env: NodeJS.ProcessEnv = process.env): ResolvedConfig | null {
  return readConfig(STORE_OPTS, env);
}

export function setBotConfig(key: string, value: string, env: NodeJS.ProcessEnv = process.env): void {
  setConfig(key, value, STORE_OPTS, env);
}

export function deleteBotConfig(key: string, env: NodeJS.ProcessEnv = process.env): void {
  deleteConfig(key, STORE_OPTS, env);
}
