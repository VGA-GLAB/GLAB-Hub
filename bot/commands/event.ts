// /event — 今後のイベント一覧。登録は施設予約を必須にするWeb hubへ一本化。

import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { getEventStore } from '../../plugins/events/store.ts';
import { parseAudience } from '../../plugins/roles/audience.ts';
import { formatEventCard } from '../format.ts';
import type { BotCommand, CommandDeps } from './types.ts';

const data = new SlashCommandBuilder()
  .setName('event')
  .setDescription('GLAB イベント')
  .addSubcommand((s) => s.setName('list').setDescription('今後のイベント一覧'))
  .toJSON();

async function handle(
  interaction: ChatInputCommandInteraction,
  deps: CommandDeps,
): Promise<void> {
  // Discord には役職を解決する手段が無いので、 リマインダと同じく役職限定イベントは出さない。
  const events = (await getEventStore().list())
    .filter((event) => (parseAudience(event.audience_roles) ?? []).length === 0);
  if (events.length === 0) {
    await interaction.reply({ content: '今後のイベントはありません。', flags: MessageFlags.Ephemeral });
    return;
  }
  const text = events.slice(0, 10).map(formatEventCard).join('\n\n');
  await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
}

const command: BotCommand = { data, name: 'event', handle };
export default command;
