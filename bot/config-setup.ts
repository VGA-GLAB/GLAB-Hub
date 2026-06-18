// GLAB Bot 暗号化 config セットアップ CLI。
//
//   npm run config-setup
//
// 各キーを対話入力し、 暗号化 config (glab-bot.config.json) に保存する。
// token / API キーは AES-256-GCM 暗号化、 それ以外は平文。 Enter でスキップ (既存値維持)。

import { createInterface } from 'node:readline/promises';
import {
  readBotConfig,
  setBotConfig,
  configPath,
  GLAB_BOT_CONFIG_KEYS,
  GLAB_BOT_SECRET_KEYS,
} from './config-store.ts';

const HINTS: Record<string, string> = {
  DISCORD_TOKEN: 'Discord Bot トークン',
  DISCORD_CLIENT_ID: 'Discord アプリ (client) ID',
  DISCORD_GUILD_ID: 'コマンド登録先ギルド (サーバ) ID',
  GLAB_EVENT_CHANNEL_ID: 'イベント通知チャンネル ID',
  GLAB_JOB_CHANNEL_ID: '就活情報チャンネル ID',
  GLAB_ADMIN_USER_IDS: 'admin ユーザ ID (カンマ区切り)',
  GLAB_LLM_BACKEND: 'LLM backend: claude-cli | anthropic | mock',
  GLAB_LLM_MODEL: 'LLM モデル (既定 claude-opus-4-8)',
  ANTHROPIC_API_KEY: 'Anthropic API キー (backend=anthropic 時)',
};

async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('=== GLAB Bot 暗号化 config セットアップ ===');
  console.log(`保存先: ${configPath()}`);
  console.log(`暗号化キー: ${[...GLAB_BOT_SECRET_KEYS].join(', ')}\n`);

  const existing = readBotConfig() ?? {};
  let saved = 0;

  for (const key of GLAB_BOT_CONFIG_KEYS) {
    const isSecret = GLAB_BOT_SECRET_KEYS.has(key);
    const cur = existing[key];
    const shown = cur ? (isSecret ? '****（設定済）' : cur) : '（未設定）';
    const hint = HINTS[key] ? ` — ${HINTS[key]}` : '';
    const answer = await rl.question(`${key}${hint}\n  現在: ${shown}\n  新値 (Enter で維持): `);
    const v = answer.trim();
    if (v) {
      setBotConfig(key, v);
      saved++;
    }
  }

  rl.close();
  console.log(`\n保存しました (${saved} 件更新): ${configPath()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
