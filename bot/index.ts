// GLAB Discord Bot エントリポイント。
//
// discord.js Gateway (常時接続) で起動し、GLAB から Discord への通知を配信する。
// 起動時に slash command を空の登録へ同期 + 通知スケジューラを開始。設定は暗号化 config から
// 読む (npm run config-setup)。イベントはGLAB PostgreSQL、Bot求人等はSQLiteを使う。

import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadConfig } from './config.ts';
import { openSharedDb } from './db.ts';
import { registerCommands } from './commands/registry.ts';
import { replyToDisabledCommand } from './commands/disabled-interaction.ts';
import { startScheduler } from './notify/scheduler.ts';
import { startMemberResolver } from './member-resolver.ts';
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
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  let stopScheduler: (() => void) | null = null;
  let stopMemberResolver: (() => Promise<void>) | null = null;
  let shutdownPromise: Promise<void> | null = null;
  client.once(Events.ClientReady, async (c) => {
    console.log(`[glab-bot] logged in as ${c.user.tag} (notification-only)`);
    try {
      await registerCommands(cfg);
    } catch (e) {
      console.error('[glab-bot] command 登録に失敗:', e);
    }
    if (shutdownPromise) return;
    stopScheduler = startScheduler(client, db, cfg);
    if (cfg.guildId) stopMemberResolver = startMemberResolver(client, db, cfg.guildId);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await replyToDisabledCommand(interaction);
    } catch (e) {
      console.error(`[glab-bot] disabled command notice failed for "${interaction.commandName}":`, e);
    }
  });

  const shutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      stopScheduler?.();
      await stopMemberResolver?.();
      client.destroy();
      db.close?.();
      await closeEventStore();
    })();
    return shutdownPromise;
  };
  process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

  await client.login(cfg.discordToken);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
