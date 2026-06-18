// GLAB Discord Bot 設定。
//
// 読込順: コード既定 < 暗号化 config (glab-bot.config.json) < 環境変数。
// token / API キーは暗号化 config に保存する (平文 JSON を置かない、 ユーザ要望)。
// 設定は `npm run config-setup` で対話登録する。

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBotConfig } from './config-store.ts';

const BOT_DIR = dirname(fileURLToPath(import.meta.url));

export type LlmBackend = 'claude-cli' | 'anthropic' | 'mock';

export interface BotConfig {
  discordToken: string;
  discordClientId: string;
  guildId: string;
  /** 共有 SQLite (Corpus と同じ corpus.db)。 */
  dbPath: string;
  channels: { event: string; job: string };
  /** admin 扱いする Discord ユーザ id。 */
  adminUserIds: string[];
  llm: {
    backend: LlmBackend;
    model: string;
    anthropicApiKey: string;
    anthropicBaseUrl: string;
    claudeCliPath: string;
    claudeCliTimeoutMs: number;
    gitBashPath: string;
    systemPrompt: string;
    maxTokens: number;
  };
  reminder: {
    intervalMs: number;
    eventWindowMs: number;
    jobWindowMs: number;
  };
}

const DEFAULT_SYSTEM_PROMPT =
  'あなたは学校組織 GLAB (Vantan Game Academy のゲーム制作ラボ) の Discord アシスタントです。' +
  'メンバーの質問 (就活・制作・スケジュール・技術) に、 簡潔で実践的な日本語で答えてください。' +
  '分からないことは正直に分からないと答えてください。';

export function loadConfig(): BotConfig {
  const stored = readBotConfig() ?? {};

  /** env 優先 → 暗号化 config → 既定。 */
  const pick = (key: string, fallback = ''): string => {
    const e = process.env[key];
    if (e && e.trim()) return e.trim();
    const s = stored[key];
    if (s && s.trim()) return s.trim();
    return fallback;
  };
  const pickNum = (key: string, fallback: number): number => {
    const v = pick(key);
    const n = Number(v);
    return v && Number.isFinite(n) ? n : fallback;
  };

  const backend = (pick('GLAB_LLM_BACKEND', 'claude-cli') as LlmBackend) || 'claude-cli';

  return {
    discordToken: pick('DISCORD_TOKEN'),
    discordClientId: pick('DISCORD_CLIENT_ID'),
    guildId: pick('DISCORD_GUILD_ID'),
    dbPath: pick('GLAB_DB_PATH', resolve(BOT_DIR, '..', 'data', 'corpus.db')),
    channels: {
      event: pick('GLAB_EVENT_CHANNEL_ID'),
      job: pick('GLAB_JOB_CHANNEL_ID'),
    },
    adminUserIds: pick('GLAB_ADMIN_USER_IDS')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    llm: {
      backend,
      model: pick('GLAB_LLM_MODEL', 'claude-opus-4-8'),
      anthropicApiKey: pick('ANTHROPIC_API_KEY'),
      anthropicBaseUrl: pick('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
      claudeCliPath: pick('GLAB_CLAUDE_CLI_PATH', 'claude'),
      claudeCliTimeoutMs: pickNum('GLAB_CLAUDE_CLI_TIMEOUT_MS', 120_000),
      gitBashPath: pick('CLAUDE_CODE_GIT_BASH_PATH', 'C:\\Program Files\\Git\\bin\\bash.exe'),
      systemPrompt: pick('GLAB_LLM_SYSTEM_PROMPT', DEFAULT_SYSTEM_PROMPT),
      maxTokens: pickNum('GLAB_LLM_MAX_TOKENS', 1024),
    },
    reminder: {
      intervalMs: pickNum('GLAB_REMINDER_INTERVAL_MS', 300_000),
      eventWindowMs: pickNum('GLAB_EVENT_WINDOW_MS', 24 * 3_600_000),
      jobWindowMs: pickNum('GLAB_JOB_WINDOW_MS', 3 * 24 * 3_600_000),
    },
  };
}
