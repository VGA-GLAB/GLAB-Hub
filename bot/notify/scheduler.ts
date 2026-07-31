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
  forumThreadsForNotification,
  markForumThreadNotified,
  type SqlDb,
} from '../../plugins/data.ts';
import { getEventStore } from '../../plugins/events/store.ts';
import { formatEventCard, formatJobCard, formatReviewCard } from '../format.ts';
import { postToChannel } from '../channels.ts';
import { createConsultThread, ensureConsultForum, resolveConsultThread } from '../forum.ts';
import { glabConfigured, glabExternal } from '../glab-api.ts';

/** 1 tick で流す感想リレーの最大件数。 */
const REVIEW_RELAY_BATCH = 10;

/** Discord のメッセージ本文上限。 */
const DISCORD_MESSAGE_MAX = 2_000;

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
        if (ev.recurrence === 'weekly' && ev.occurrence_date) {
          await events.markOccurrenceNotified(ev.id, ev.occurrence_date, msgId);
        } else {
          await events.markNotified(ev.id, msgId);
        }
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
      await postPendingConsults(client, cfg);
      await resolvePostedConsults(client, cfg);
      await postForumThreads(client, db, cfg);
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

interface PendingConsult {
  id: string;
  title: string;
  body: string;
  invited: Array<{ discordId: string | null }>;
}

/**
 * 未投稿の相談を相談フォーラムへ立てる。 1 件の失敗で他の相談 (と後続の通知) を
 * 巻き添えにしないよう、 相談ごとに握りつぶして次 tick の再試行に委ねる。
 */
async function postPendingConsults(client: Client, cfg: BotConfig): Promise<void> {
  if (!glabConfigured(cfg)) return;
  const pending = await glabExternal<{ consults: PendingConsult[] }>(cfg, '/external/consults/pending');
  // 相談が無い間は、 フォーラム解決 (未設定なら新規作成) まで踏み込まない。
  if (!pending.ok || pending.data.consults.length === 0) return;
  const forum = await ensureConsultForum(client, cfg);
  if (!forum) return;
  for (const consult of pending.data.consults) {
    try {
      const mentions = consult.invited.flatMap((member) => member.discordId ? [member.discordId] : []);
      const posted = await createConsultThread(forum, { title: consult.title, body: consult.body, mentions });
      const acked = await glabExternal(cfg, `/external/consults/${encodeURIComponent(consult.id)}/posted`, {
        method: 'POST', body: { threadId: posted.threadId, messageId: posted.messageId },
      });
      if (!acked.ok) {
        console.error(
          `[glab-bot] 相談 ${consult.id} のスレッド ${posted.threadId} は作成できたが posted 記録に失敗 — 次 tick で重複投稿の恐れ`,
        );
      }
    } catch (e) {
      console.error(`[glab-bot] 相談 ${consult.id} のスレッド作成に失敗:`, e);
    }
  }
}

async function postForumThreads(client: Client, db: SqlDb, cfg: BotConfig): Promise<void> {
  if (!cfg.channels.forum) return;
  for (const thread of forumThreadsForNotification(db)) {
    // 本文は hub 側で 8000 字まで許すので、 Discord の 2000 字上限で丸める
    // (超過すると送信が必ず失敗し、 未通知のまま毎 tick 再試行し続けてしまう)。
    const body = `💬 **${thread.title}**\n${thread.body}`.slice(0, DISCORD_MESSAGE_MAX);
    const messageId = await postToChannel(
      client, cfg.channels.forum, body,
      { allowedMentions: { parse: [] } },
    );
    if (messageId) markForumThreadNotified(db, thread.id);
  }
}

/**
 * 解決済みの相談スレッドに resolved タグを付けてアーカイブする。
 * hub 側は ack (resolved-posted) を受けた相談を以後返さないので、 同じスレッドを
 * 毎 tick 触り続けることはない。 スレッドが消えている場合も ack して打ち切る。
 */
async function resolvePostedConsults(client: Client, cfg: BotConfig): Promise<void> {
  if (!glabConfigured(cfg)) return;
  const resolved = await glabExternal<{ consults: Array<{ id: string; threadId: string | null }> }>(
    cfg,
    '/external/consults/resolved',
  );
  if (!resolved.ok || resolved.data.consults.length === 0) return;
  const forum = await ensureConsultForum(client, cfg);
  if (!forum) return;
  for (const consult of resolved.data.consults) {
    if (!consult.threadId) continue;
    try {
      const thread = await forum.threads.fetch(consult.threadId).catch(() => null);
      if (thread) await resolveConsultThread(thread, forum);
      await glabExternal(cfg, `/external/consults/${encodeURIComponent(consult.id)}/resolved-posted`, {
        method: 'POST', body: {},
      });
    } catch (e) {
      console.error(`[glab-bot] 相談 ${consult.id} のスレッド解決処理に失敗:`, e);
    }
  }
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
