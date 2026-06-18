// /job — 就活情報の投稿 / 検索 / クローズ。 投稿は #job へ通知。

import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { createJob, getJob, listJobs, closeJob } from '../../plugins/data.ts';
import { formatJobCard, parseDateInput } from '../format.ts';
import { postToChannel } from '../channels.ts';
import type { BotCommand, CommandDeps } from './types.ts';

const data = new SlashCommandBuilder()
  .setName('job')
  .setDescription('GLAB 就活情報')
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('就活情報を投稿して #job に通知する')
      .addStringOption((o) => o.setName('company').setDescription('企業名').setRequired(true))
      .addStringOption((o) => o.setName('position').setDescription('募集 / 職種'))
      .addStringOption((o) => o.setName('category').setDescription('業種 (例: ゲーム)'))
      .addStringOption((o) => o.setName('url').setDescription('URL'))
      .addStringOption((o) => o.setName('deadline').setDescription('締切 (例: 2026-07-31)'))
      .addStringOption((o) => o.setName('desc').setDescription('詳細')),
  )
  .addSubcommand((s) =>
    s
      .setName('list')
      .setDescription('就活情報を検索 / 一覧')
      .addStringOption((o) => o.setName('q').setDescription('企業 / 職種 / 本文の検索語'))
      .addStringOption((o) => o.setName('category').setDescription('業種で絞る')),
  )
  .addSubcommand((s) =>
    s
      .setName('close')
      .setDescription('募集を終了にする (投稿者 / admin)')
      .addIntegerOption((o) => o.setName('id').setDescription('求人 ID').setRequired(true)),
  )
  .toJSON();

async function handle(
  interaction: ChatInputCommandInteraction,
  deps: CommandDeps,
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'add') {
    const company = interaction.options.getString('company', true);
    const deadlineRaw = interaction.options.getString('deadline');
    const deadlineAt = deadlineRaw ? parseDateInput(deadlineRaw) : null;
    const id = createJob(deps.db, {
      company,
      position: interaction.options.getString('position') ?? null,
      category: interaction.options.getString('category') ?? null,
      url: interaction.options.getString('url') ?? null,
      body: interaction.options.getString('desc') ?? null,
      deadlineAt,
      postedBy: `${interaction.user.username} (discord)`,
    });
    const job = getJob(deps.db, id);
    if (job) await postToChannel(deps.client, deps.cfg.channels.job, formatJobCard(job));
    await interaction.reply({
      content: `就活情報「${company}」(ID ${id}) を投稿し、 #job に通知しました。`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (sub === 'list') {
    const q = interaction.options.getString('q') ?? undefined;
    const category = interaction.options.getString('category') ?? undefined;
    const jobs = listJobs(deps.db, { status: 'open', q, category });
    if (jobs.length === 0) {
      await interaction.reply({ content: '該当する就活情報はありません。', flags: MessageFlags.Ephemeral });
      return;
    }
    const text = jobs
      .slice(0, 8)
      .map((j) => `**[${j.id}]** ${formatJobCard(j)}`)
      .join('\n\n');
    await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    return;
  }

  // close
  const id = interaction.options.getInteger('id', true);
  const job = getJob(deps.db, id);
  if (!job) {
    await interaction.reply({ content: `求人 ID ${id} が見つかりません。`, flags: MessageFlags.Ephemeral });
    return;
  }
  const isOwner = job.posted_by === `${interaction.user.username} (discord)`;
  const isAdmin = deps.cfg.adminUserIds.includes(interaction.user.id);
  if (!isOwner && !isAdmin) {
    await interaction.reply({
      content: 'この求人をクローズする権限がありません (投稿者 / admin のみ)。',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  closeJob(deps.db, id);
  await interaction.reply({ content: `求人 ID ${id} を募集終了にしました。`, flags: MessageFlags.Ephemeral });
}

const command: BotCommand = { data, name: 'job', handle };
export default command;
