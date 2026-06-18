// コマンド共通の依存と型。

import type { ChatInputCommandInteraction, Client } from 'discord.js';
import type { SqlDb } from '../../plugins/data.ts';
import type { BotConfig } from '../config.ts';
import type { LlmClient } from '../llm/client.ts';

export interface CommandDeps {
  db: SqlDb;
  cfg: BotConfig;
  llm: LlmClient;
  client: Client;
}

export interface BotCommand {
  /** SlashCommandBuilder().toJSON() の結果。 */
  data: unknown;
  name: string;
  handle(interaction: ChatInputCommandInteraction, deps: CommandDeps): Promise<void>;
}
