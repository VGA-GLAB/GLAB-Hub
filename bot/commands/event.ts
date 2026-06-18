// /event — イベントの登録 / 一覧。 登録は即 #event へ通知。

import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { createEvent, getEvent, listEvents, markEventNotified } from '../../plugins/data.ts';
import { formatEventCard, parseDateInput } from '../format.ts';
import { postToChannel } from '../channels.ts';
import type { BotCommand, CommandDeps } from './types.ts';

const data = new SlashCommandBuilder()
  .setName('event')
  .setDescription('GLAB イベント')
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('イベントを登録して #event に通知する')
      .addStringOption((o) => o.setName('title').setDescription('タイトル').setRequired(true))
      .addStringOption((o) =>
        o.setName('when').setDescription('日時 (例: 2026-07-01 19:00)').setRequired(true),
      )
      .addStringOption((o) => o.setName('location').setDescription('場所'))
      .addStringOption((o) => o.setName('desc').setDescription('詳細')),
  )
  .addSubcommand((s) => s.setName('list').setDescription('今後のイベント一覧'))
  .toJSON();

async function handle(
  interaction: ChatInputCommandInteraction,
  deps: CommandDeps,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const title = interaction.options.getString('title', true);
    const whenRaw = interaction.options.getString('when', true);
    const startsAt = parseDateInput(whenRaw);
    if (startsAt == null) {
      await interaction.reply({
        content: `日時を解釈できませんでした: "${whenRaw}"（例: 2026-07-01 19:00）`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const id = createEvent(deps.db, {
      title,
      body: interaction.options.getString('desc') ?? null,
      location: interaction.options.getString('location') ?? null,
      startsAt,
      createdBy: `${interaction.user.username} (discord)`,
    });
    const ev = getEvent(deps.db, id);
    if (ev) {
      const msgId = await postToChannel(deps.client, deps.cfg.channels.event, formatEventCard(ev));
      markEventNotified(deps.db, id, msgId);
    }
    await interaction.reply({
      content: `イベント「${title}」を登録し、 #event に通知しました。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // list
  const events = listEvents(deps.db, false);
  if (events.length === 0) {
    await interaction.reply({ content: '今後のイベントはありません。', flags: MessageFlags.Ephemeral });
    return;
  }
  const text = events.slice(0, 10).map(formatEventCard).join('\n\n');
  await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
}

const command: BotCommand = { data, name: 'event', handle };
export default command;
