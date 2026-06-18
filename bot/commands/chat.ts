// /chat — LLM とのやりとり。 チャンネル × ユーザ単位で短い会話履歴を保持する。

import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { LlmMessage } from '../llm/client.ts';
import type { BotCommand, CommandDeps } from './types.ts';

/** (channelId:userId) → 直近の会話履歴。 メモリ保持 (プロセス再起動で消える)。 */
const histories = new Map<string, LlmMessage[]>();
const MAX_TURNS = 8; // user+assistant をこの数まで保持

const data = new SlashCommandBuilder()
  .setName('chat')
  .setDescription('GLAB アシスタント (LLM) と会話する')
  .addStringOption((o) => o.setName('message').setDescription('メッセージ').setRequired(true))
  .addBooleanOption((o) =>
    o.setName('reset').setDescription('会話履歴をリセットしてから送る'),
  )
  .toJSON();

async function handle(
  interaction: ChatInputCommandInteraction,
  deps: CommandDeps,
): Promise<void> {
  const message = interaction.options.getString('message', true);
  const reset = interaction.options.getBoolean('reset') ?? false;
  const key = `${interaction.channelId}:${interaction.user.id}`;

  if (reset) histories.delete(key);
  const history = histories.get(key) ?? [];
  history.push({ role: 'user', content: message });

  await interaction.deferReply();

  try {
    const result = await deps.llm.invoke({
      system: deps.cfg.llm.systemPrompt,
      messages: history.slice(-MAX_TURNS * 2),
      model: deps.cfg.llm.model,
      maxTokens: deps.cfg.llm.maxTokens,
    });
    const text = result.text || '(空の応答)';
    history.push({ role: 'assistant', content: text });
    // 履歴を上限で切り詰めて保存
    histories.set(key, history.slice(-MAX_TURNS * 2));

    // Discord の 2000 文字制限に合わせて切る
    const reply = text.length > 1900 ? `${text.slice(0, 1900)}…` : text;
    await interaction.editReply(reply);
  } catch (e) {
    await interaction.editReply(`LLM 呼び出しに失敗しました: ${String(e).slice(0, 300)}`);
  }
}

const command: BotCommand = { data, name: 'chat', handle };
export default command;
