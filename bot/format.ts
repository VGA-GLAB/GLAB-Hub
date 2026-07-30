// イベント / 就活カードの整形 + 日時入力パース。
// コマンドハンドラと通知スケジューラの両方で使う。

import type { JobRow, ReviewRelayRow } from '../plugins/data.ts';
import type { EventRow } from '../plugins/events/store.ts';

/** Discord の 1 メッセージ上限。 */
const DISCORD_MESSAGE_LIMIT = 2_000;

function fmt(ts: number): string {
  const d = new Date(ts);
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}(${w}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 「2026-07-01 14:00」「2026/07/01 14:00」「ISO」等を epoch ms に。 失敗時 null。 */
export function parseDateInput(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  let ms = Date.parse(s);
  if (Number.isNaN(ms)) ms = Date.parse(s.replace(/\//g, '-').replace(' ', 'T'));
  return Number.isNaN(ms) ? null : ms;
}

export function formatEventCard(ev: EventRow): string {
  const lines = [`📅 **${ev.title}**`, `🕒 ${fmt(ev.starts_at)}`];
  if (ev.location) lines.push(`📍 ${ev.location}`);
  if (ev.body) lines.push('', ev.body);
  return lines.join('\n');
}

export function formatJobCard(job: JobRow): string {
  const head = job.position ? `${job.company} — ${job.position}` : job.company;
  const lines = [`💼 **${head}**`];
  if (job.category) lines.push(`🏷 ${job.category}`);
  if (job.deadline_at) lines.push(`⏰ 締切 ${fmt(job.deadline_at)}`);
  if (job.url) lines.push(`🔗 ${job.url}`);
  if (job.body) lines.push('', job.body);
  return lines.join('\n');
}

/**
 * ユーザ入力を含む感想を、Discord の 2,000 文字上限内に収める。
 * 削るのは可変長の本文 (excerpt) だけにして、投稿者と URL は常に残す
 * (全体を末尾から切ると出典が消え、リレー先で誰の感想か辿れなくなる)。
 */
export function formatReviewCard(review: ReviewRelayRow): string {
  const recommendation = review.recommend === null
    ? 'おすすめ: 未評価'
    : review.recommend === 1 ? 'おすすめ' : 'おすすめしない';
  const head = `🎮 **${review.gameTitle}**\n👍 ${recommendation}\n\n`;
  const tail = `\n\n投稿者: ${review.author}\n🔗 ${review.url}`;
  const excerpt = truncate(review.excerpt, DISCORD_MESSAGE_LIMIT - head.length - tail.length);
  // head/tail だけで上限を超える異常入力に備えた最終防衛線。
  return truncate(`${head}${excerpt}${tail}`, DISCORD_MESSAGE_LIMIT);
}

/** limit (UTF-16 code unit) 以内に切り詰める。 サロゲートペアは分割しない。 */
function truncate(text: string, limit: number): string {
  if (limit <= 0) return '';
  if (text.length <= limit) return text;
  const end = limit - 1;
  // 切断位置の直前が上位サロゲートなら、 単独サロゲートを残さないよう 1 文字戻す。
  const safeEnd = /[\uD800-\uDBFF]/.test(text[end - 1] ?? '') ? end - 1 : end;
  return `${text.slice(0, Math.max(0, safeEnd))}…`;
}
