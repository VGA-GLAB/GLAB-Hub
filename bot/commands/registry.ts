// 全コマンドの登録 (dispatch 用配列 + Discord への slash command 登録)。

import { REST, Routes } from 'discord.js';
import type { BotConfig } from '../config.ts';
import type { BotCommand } from './types.ts';
import eventCommand from './event.ts';
import jobCommand from './job.ts';
import chatCommand from './chat.ts';

export const ALL_COMMANDS: BotCommand[] = [eventCommand, jobCommand, chatCommand];

/** Discord へ slash command を登録する。 guildId 指定時はそのギルドへ即時、 無ければ global。 */
export async function registerCommands(cfg: BotConfig): Promise<void> {
  if (!cfg.discordToken || !cfg.discordClientId) {
    console.warn('[glab-bot] DISCORD_TOKEN / DISCORD_CLIENT_ID 未設定: command 登録をスキップ');
    return;
  }
  const rest = new REST().setToken(cfg.discordToken);
  const body = ALL_COMMANDS.map((c) => c.data);
  if (cfg.guildId) {
    await rest.put(Routes.applicationGuildCommands(cfg.discordClientId, cfg.guildId), { body });
    console.log(`[glab-bot] ${body.length} 個の guild command を登録 (guild ${cfg.guildId})`);
  } else {
    await rest.put(Routes.applicationCommands(cfg.discordClientId), { body });
    console.log(`[glab-bot] ${body.length} 個の global command を登録 (反映に最大 1h)`);
  }
}
