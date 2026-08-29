import type { Client } from 'discord.js';
import {
  isDailyNotificationDue,
  tokyoDateKey,
} from '../../plugins/daily-engagement/catalog.ts';
import {
  getOrCreateDailyContent,
  markDailyDiscordNotified,
} from '../../plugins/daily-engagement/store.ts';
import type { SqlDb } from '../../plugins/data.ts';
import { postToChannel } from '../channels.ts';
import type { BotConfig } from '../config.ts';
import { formatDailyEngagementMessage } from './daily-engagement-message.ts';

export type DailyNotificationResult =
  | 'disabled'
  | 'not-due'
  | 'already-posted'
  | 'failed'
  | 'posted';

type DailyNotificationConfig = {
  channels: Pick<BotConfig['channels'], 'daily'>;
  daily: BotConfig['daily'];
  glabBaseUrl: string;
};

/**
 * 投稿成功後だけ notified_at を埋める。失敗時は次の scheduler tick で再試行する。
 * @implements SPEC-GLAB-DAILY-004
 */
export async function postDailyEngagementIfDue(
  client: Client,
  db: SqlDb,
  cfg: DailyNotificationConfig,
  now: Date = new Date(),
): Promise<DailyNotificationResult> {
  if (!cfg.channels.daily) return 'disabled';
  try {
    if (!isDailyNotificationDue(now, cfg.daily.notifyAt)) return 'not-due';
    const daily = getOrCreateDailyContent(db, tokyoDateKey(now), now.getTime());
    if (daily.discordNotifiedAt !== null) return 'already-posted';
    const messageId = await postToChannel(
      client,
      cfg.channels.daily,
      formatDailyEngagementMessage(daily, cfg.glabBaseUrl),
      { allowedMentions: { parse: [] } },
    );
    if (!messageId) return 'failed';
    markDailyDiscordNotified(db, daily.dateKey, messageId, now.getTime());
    return 'posted';
  } catch (error) {
    // 日次通知の障害でイベント・求人など他の通知を止めない。
    console.error('[glab-bot] daily engagement notification failed:', error);
    return 'failed';
  }
}
