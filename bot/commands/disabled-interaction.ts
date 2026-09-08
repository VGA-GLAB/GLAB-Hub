// Discord is retained as a notification destination. Stale slash commands may remain
// visible until Discord command registration is synchronized, so answer them without
// invoking any GLAB data, API, or LLM operation.

import {
  MessageFlags,
  type ChatInputCommandInteraction,
} from 'discord.js';

const DISABLED_COMMAND_MESSAGE =
  'Discord からの GLAB 操作は終了しました。GLAB の画面から操作してください。' +
  'デスクトップアプリへの移行は準備中です。';

export async function replyToDisabledCommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  // 二重配送などで既に ack 済みの Interaction に reply すると例外になり、 利用者には
  // Discord の汎用エラーだけが出る。 案内を必ず届けるため followUp へ退避する。
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({
      content: DISABLED_COMMAND_MESSAGE,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    content: DISABLED_COMMAND_MESSAGE,
    flags: MessageFlags.Ephemeral,
  });
}
