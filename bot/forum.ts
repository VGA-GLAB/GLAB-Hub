import {
  ChannelType,
  type Client,
  type ForumChannel,
  type GuildForumTagData,
  type ThreadChannel,
} from 'discord.js';
import type { BotConfig } from './config.ts';
import { setBotConfig } from './config-store.ts';

const OPEN_TAG = 'open';
const RESOLVED_TAG = 'resolved';
/** Discord のスレッド名上限。 相談タイトル (hub 側は 160 字まで) はここで丸める。 */
const THREAD_NAME_MAX = 100;
/** Discord のメッセージ本文上限。 */
const MESSAGE_MAX = 2_000;

export async function ensureConsultForum(client: Client, cfg: BotConfig): Promise<ForumChannel | null> {
  if (!cfg.guildId) return null;
  const guild = await client.guilds.fetch(cfg.guildId);
  let forum: ForumChannel | null = await configuredForum(client, cfg.channels.consultForum);
  if (!forum) {
    forum = guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildForum && channel.name === '相談',
    ) as ForumChannel | undefined ?? null;
  }
  if (!forum) {
    forum = await guild.channels.create({
      name: '相談',
      type: ChannelType.GuildForum,
      topic: 'GLAB の相談スレッド',
    }) as ForumChannel;
  }
  await ensureTags(forum);
  if (cfg.channels.consultForum !== forum.id) {
    setBotConfig('GLAB_CONSULT_FORUM_CHANNEL_ID', forum.id);
    // 次 tick 以降に同じ書き込みを繰り返さないよう、 メモリ上の config も揃える。
    cfg.channels.consultForum = forum.id;
  }
  return forum;
}

export async function createConsultThread(
  forum: ForumChannel,
  input: { title: string; body: string; mentions: string[] },
): Promise<{ threadId: string; messageId: string }> {
  const openTagId = forum.availableTags.find((tag) => tag.name === OPEN_TAG)?.id;
  if (!openTagId) throw new Error('consult forum open tag is missing');
  const uniqueMentions = [...new Set(input.mentions)].slice(0, 20);
  const mentionText = uniqueMentions.map((id) => `<@${id}>`).join(' ');
  // 相談本文は hub 側で 8000 字まで許すが、 Discord のメッセージ上限は 2000 字。
  const content = `${mentionText}${mentionText ? '\n\n' : ''}${input.body}`.slice(0, MESSAGE_MAX);
  const created = await forum.threads.create({
    name: input.title.slice(0, THREAD_NAME_MAX),
    message: {
      content,
      allowedMentions: { parse: [], users: uniqueMentions },
    },
    appliedTags: [openTagId],
  });
  const message = await created.fetchStarterMessage();
  if (!message) throw new Error('consult forum starter message was not created');
  return { threadId: created.id, messageId: message.id };
}

export async function resolveConsultThread(thread: ThreadChannel, forum: ForumChannel): Promise<void> {
  const resolvedTagId = forum.availableTags.find((tag) => tag.name === RESOLVED_TAG)?.id;
  if (!resolvedTagId) throw new Error('consult forum resolved tag is missing');
  await thread.setAppliedTags([resolvedTagId]);
  await thread.setArchived(true);
}

async function configuredForum(client: Client, id: string): Promise<ForumChannel | null> {
  if (!id) return null;
  const channel = await client.channels.fetch(id).catch(() => null);
  return channel?.type === ChannelType.GuildForum ? channel : null;
}

async function ensureTags(forum: ForumChannel): Promise<void> {
  const missing = [OPEN_TAG, RESOLVED_TAG].filter((name) => !forum.availableTags.some((tag) => tag.name === name));
  if (forum.availableTags.length + missing.length > 20) throw new Error('consult forum tag limit would exceed 20');
  if (missing.length === 0) return;
  const tags: GuildForumTagData[] = [
    ...forum.availableTags.map((tag) => ({ id: tag.id, name: tag.name, moderated: tag.moderated, emoji: tag.emoji ?? undefined })),
    ...missing.map((name) => ({ name, moderated: false })),
  ];
  await forum.setAvailableTags(tags, 'Ensure GLAB consult status tags');
}
