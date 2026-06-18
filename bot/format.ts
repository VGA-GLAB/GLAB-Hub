// イベント / 就活カードの整形 + 日時入力パース。
// コマンドハンドラと通知スケジューラの両方で使う。

import type { EventRow, JobRow } from '../plugins/data.ts';

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
