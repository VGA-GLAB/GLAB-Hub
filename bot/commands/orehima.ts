import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotCommand, CommandDeps } from './types.ts';
import { glabConfigured, glabExternal } from '../glab-api.ts';

/** 本人解決に成功したが未連携だった場合の案内 (Discord 連携は Cernere 側で行う)。 */
const DISCORD_LINK_REQUIRED = 'Cernere のアカウント設定で Discord 連携をしてください。';
const DEFAULT_HOURS = 2;

const data = new SlashCommandBuilder()
  .setName('orehima')
  .setDescription('おれひまの状態を更新')
  .addSubcommand((subcommand) => subcommand.setName('on').setDescription('今ひまです').addNumberOption((option) => option.setName('hours').setDescription('ひまでいる時間').setMinValue(0.25).setMaxValue(24)))
  .addSubcommand((subcommand) => subcommand.setName('off').setDescription('おれひまを終了'))
  .toJSON();

async function handle(interaction: ChatInputCommandInteraction, deps: CommandDeps): Promise<void> {
  if (!glabConfigured(deps.cfg)) {
    await interaction.reply({ content: 'おれひま連携は現在利用できません。', flags: MessageFlags.Ephemeral });
    return;
  }
  // hub への往復が 2 回あるので、 Discord の 3 秒応答期限に間に合わせるため defer する。
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const identity = await glabExternal<{ userId: string; displayName: string } | null>(
    deps.cfg,
    '/external/presence/resolve',
    { method: 'POST', body: { discordId: interaction.user.id } },
  );
  // 到達失敗 (ok:false) と 「hub は答えたが未連携」 (data === null) を混同しない。
  if (!identity.ok) {
    await interaction.editReply('おれひま連携に失敗しました。');
    return;
  }
  if (identity.data === null) {
    await interaction.editReply(DISCORD_LINK_REQUIRED);
    return;
  }
  const on = interaction.options.getSubcommand() === 'on';
  const hours = on ? (interaction.options.getNumber('hours') ?? DEFAULT_HOURS) : undefined;
  const result = await glabExternal<{ ok: true }>(deps.cfg, '/external/presence', {
    method: 'POST',
    body: { discordId: interaction.user.id, availableNow: on, hours },
  });
  await interaction.editReply(
    result.ok
      ? (on ? `おれひまを ${hours} 時間有効にしました。` : 'おれひまを終了しました。')
      : 'おれひまの更新に失敗しました。',
  );
}

const command: BotCommand = { data, name: 'orehima', handle };
export default command;
