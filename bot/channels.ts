// Discord チャンネル投稿ヘルパ。

import type { Client, MessageCreateOptions } from 'discord.js';

/** 指定チャンネルへ送信し、 メッセージ id を返す。 失敗 / 未設定時は null。 */
export async function postToChannel(
  client: Client,
  channelId: string,
  content: string,
  options: Pick<MessageCreateOptions, 'allowedMentions'> = {},
): Promise<string | null> {
  if (!channelId) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch && ch.isTextBased() && 'send' in ch) {
      const msg = await ch.send({ content, ...options });
      return msg.id;
    }
  } catch {
    /* 投稿失敗は呼び出し側で握りつぶす (通知は best-effort) */
  }
  return null;
}
