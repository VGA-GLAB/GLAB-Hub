// 通知スケジューラ — 定期ポーリングで「もうすぐのイベント」「締切が近い就活」を投稿。
//
// hub (Web) と Bot はイベントPostgreSQLを共有する。Bot求人はSQLiteから読む。
// 二重投稿防止に notified_at / deadline_notified_at で既通知を管理する。
// Volputas から受けた感想リレーも同じ tick で流す (posted_at で既投稿を管理)。

import type { Client } from 'discord.js';
import type { BotConfig } from '../config.ts';
import {
  jobsDueForReminder,
  getProject,
  markReviewRelayPosted,
  markProjectReleaseNotified,
  releasesForNotification,
  markJobDeadlineNotified,
  reviewsForNotification,
  type SqlDb,
} from '../../plugins/data.ts';
import { getEventStore } from '../../plugins/events/store.ts';
import { formatEventCard, formatJobCard, formatReviewCard } from '../format.ts';
import { postToChannel } from '../channels.ts';

/** 1 tick で流す感想リレーの最大件数。 */
const REVIEW_RELAY_BATCH = 10;

export function startScheduler(client: Client, db: SqlDb, cfg: BotConfig): () => void {
  const tick = async (): Promise<void> => {
    try {
      const events = getEventStore();
      for (const ev of await events.dueForReminder(cfg.reminder.eventWindowMs)) {
        const msgId = await postToChannel(
          client,
          cfg.channels.event,
          `🔔 **まもなく開催**\n${formatEventCard(ev)}`,
        );
        await events.markNotified(ev.id, msgId);
      }
      for (const job of jobsDueForReminder(db, cfg.reminder.jobWindowMs)) {
        await postToChannel(
          client,
          cfg.channels.job,
          `⏰ **締切が近い就活情報**\n${formatJobCard(job)}`,
        );
        markJobDeadlineNotified(db, job.id);
      }
      for (const release of releasesForNotification(db, 5)) {
        const project = getProject(db, release.project_id);
        if (!project) continue;
        const messageId = await postToChannel(
          client,
          cfg.channels.event,
          `🎮 **${project.name} ${release.tag} 公開！**\n配布を開始しました。`,
        );
        if (messageId) markProjectReleaseNotified(db, release.project_id, release.release_id);
      }
      await relayQueuedReviews(client, db, cfg);
    } catch (e) {
      console.error('[glab-bot] scheduler tick error:', e);
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), cfg.reminder.intervalMs);
  timer.unref?.();
  console.log(`[glab-bot] scheduler started (interval ${cfg.reminder.intervalMs}ms)`);
  if (!cfg.channels.review) {
    console.warn('[glab-bot] GLAB_REVIEW_CHANNEL_ID 未設定 — 感想リレーはキューに滞留します');
  }
  return () => clearInterval(timer);
}

/**
 * Volputas から届いた未投稿の感想を、専用チャンネルへ古い順に流す。
 * Discord が成功を返した分だけ posted_at を埋め、失敗分は次 tick で再試行する。
 */
async function relayQueuedReviews(client: Client, db: SqlDb, cfg: BotConfig): Promise<void> {
  // 未設定なら投稿は必ず失敗するので、 毎 tick の空振りクエリごと省く
  // (キューは残るため、 チャンネル設定後に古い順から配信される)。
  if (!cfg.channels.review) return;
  for (const review of reviewsForNotification(db, REVIEW_RELAY_BATCH)) {
    const messageId = await postToChannel(
      client,
      cfg.channels.review,
      formatReviewCard(review),
      // 感想本文はユーザ入力なので、 @everyone / role メンションを一切解決させない。
      { allowedMentions: { parse: [] } },
    );
    if (messageId) markReviewRelayPosted(db, review.reviewId, messageId);
  }
}
