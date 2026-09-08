// Discord は通知先としてのみ使う。空配列を REST 登録することで既存 slash command を削除する。

import { REST, Routes } from 'discord.js';
import type { BotConfig } from '../config.ts';
import type { BotCommand } from './types.ts';

export const ALL_COMMANDS: readonly BotCommand[] = [];

/** Discord の slash command を同期する。global と設定済み guild の既存 command を削除する。 */
export async function registerCommands(cfg: BotConfig): Promise<void> {
  if (!cfg.discordToken || !cfg.discordClientId) {
    console.warn('[glab-bot] DISCORD_TOKEN / DISCORD_CLIENT_ID 未設定: command 登録をスキップ');
    return;
  }
  const rest = new REST().setToken(cfg.discordToken);
  const body = ALL_COMMANDS.map((c) => c.data);
  // 片方の scope が失敗しても、 もう片方の削除は必ず試みる。 guild command は即時反映される
  // (= 利用者に見え続ける) ので、 global の失敗で guild の削除を落としてはいけない。
  const failures: unknown[] = [];
  const sync = async (label: string, route: `/${string}`): Promise<void> => {
    try {
      await rest.put(route, { body });
      console.log(`[glab-bot] ${label} を同期 (${body.length} 件)`);
    } catch (e) {
      console.error(`[glab-bot] ${label} の同期に失敗:`, e);
      failures.push(e);
    }
  };

  await sync('global command (反映に最大 1h)', Routes.applicationCommands(cfg.discordClientId));
  if (cfg.guildId) {
    await sync(
      `guild command (guild ${cfg.guildId})`,
      Routes.applicationGuildCommands(cfg.discordClientId, cfg.guildId),
    );
  }
  // 失敗を握りつぶすと 「同期済み」 と誤認したまま旧 command が残る。 呼び出し元へ伝える。
  if (failures.length > 0) {
    throw new AggregateError(failures, 'slash command の同期に失敗した scope があります');
  }
}
