// GLAB Discord Bot エントリポイント。
//
// discord.js Gateway (常時接続) で起動し、 /event /job /chat を処理する。
// 起動時に slash command 登録 + 通知スケジューラを開始。 設定は暗号化 config から
// 読む (npm run config-setup)。イベントはGLAB PostgreSQL、Bot求人等はSQLiteを使う。

import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { loadConfig } from './config.ts';
import { openSharedDb } from './db.ts';
import { createLlmClient } from './llm/client.ts';
import { ALL_COMMANDS, registerCommands } from './commands/registry.ts';
import { startScheduler } from './notify/scheduler.ts';
import type { CommandDeps } from './commands/types.ts';
import {
  closeEventStore,
  initializeEventStore,
} from '../plugins/events/store.ts';

async function main(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg.discordToken) {
    console.error('DISCORD_TOKEN が未設定です。 `npm run config-setup` で設定してください。');
    process.exit(1);
  }

  const db = openSharedDb(cfg.dbPath);
  await initializeEventStore(cfg.databaseUrl);
  console.log('[glab-bot] PostgreSQL event store ready');
  const llm = createLlmClient(cfg);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const deps: CommandDeps = { db, cfg, llm, client };

  let stopScheduler: (() => void) | null = null;
  client.once(Events.ClientReady, async (c) => {
    console.log(`[glab-bot] logged in as ${c.user.tag} (LLM backend=${llm.backend})`);
    try {
      await registerCommands(cfg);
    } catch (e) {
      console.error('[glab-bot] command 登録に失敗:', e);
    }
    stopScheduler = startScheduler(client, db, cfg);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = ALL_COMMANDS.find((c) => c.name === interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.handle(interaction, deps);
    } catch (e) {
      console.error(`[glab-bot] command "${interaction.commandName}" error:`, e);
      const msg = 'エラーが発生しました。';
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(msg).catch(() => {});
      } else {
        await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });

  const shutdown = async (): Promise<void> => {
    stopScheduler?.();
    client.destroy();
    db.close?.();
    await closeEventStore();
  };
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

  await client.login(cfg.discordToken);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
