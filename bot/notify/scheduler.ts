// 通知スケジューラ — 定期ポーリングで「もうすぐのイベント」「締切が近い就活」を投稿。
//
// hub (Web) と Bot は同じ DB を共有するので、 Web で登録されたイベント / 就活も
// ここで拾われる。 二重投稿防止に notified_at / deadline_notified_at で既通知を管理する。

import type { Client } from 'discord.js';
import type { BotConfig } from '../config.ts';
import {
  eventsDueForReminder,
  markEventNotified,
  jobsDueForReminder,
  markJobDeadlineNotified,
  type SqlDb,
} from '../../plugins/data.ts';
import { formatEventCard, formatJobCard } from '../format.ts';
import { postToChannel } from '../channels.ts';

export function startScheduler(client: Client, db: SqlDb, cfg: BotConfig): () => void {
  const tick = async (): Promise<void> => {
    try {
      for (const ev of eventsDueForReminder(db, cfg.reminder.eventWindowMs)) {
        const msgId = await postToChannel(
          client,
          cfg.channels.event,
          `🔔 **まもなく開催**\n${formatEventCard(ev)}`,
        );
        markEventNotified(db, ev.id, msgId);
      }
      for (const job of jobsDueForReminder(db, cfg.reminder.jobWindowMs)) {
        await postToChannel(
          client,
          cfg.channels.job,
          `⏰ **締切が近い就活情報**\n${formatJobCard(job)}`,
        );
        markJobDeadlineNotified(db, job.id);
      }
    } catch (e) {
      console.error('[glab-bot] scheduler tick error:', e);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), cfg.reminder.intervalMs);
  timer.unref?.();
  console.log(`[glab-bot] scheduler started (interval ${cfg.reminder.intervalMs}ms)`);
  return () => clearInterval(timer);
}
