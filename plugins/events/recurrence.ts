import type { EventRow } from './store.ts';

export interface EventOccurrence extends EventRow {
  occurrence_date: string | null;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;

/** Returns weekly start times in the half-open [from, to) interval. */
export function weeklyOccurrencesBetween(startsAt: Date, from: Date, to: Date): Date[] {
  if (to <= from || to <= startsAt) return [];
  const cursor = new Date(startsAt);
  // ミリ秒換算の週数は DST 跨ぎで 1 週ずれ得るので floor で必ず手前に着地させ、
  // 余分な 1 件はループ内の `cursor >= from` で捨てる (行き過ぎると取りこぼす)。
  const weeks = Math.max(0, Math.floor((from.getTime() - cursor.getTime()) / WEEK_MS));
  cursor.setDate(cursor.getDate() + weeks * 7);
  const occurrences: Date[] = [];
  for (; cursor < to; cursor.setDate(cursor.getDate() + 7)) {
    if (cursor >= from) occurrences.push(new Date(cursor));
  }
  return occurrences;
}

export function occurrenceDate(startsAt: Date): string {
  const year = startsAt.getFullYear();
  const month = String(startsAt.getMonth() + 1).padStart(2, '0');
  const day = String(startsAt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function expandOccurrences(
  events: readonly EventRow[],
  from: Date,
  to: Date,
): EventOccurrence[] {
  return events.flatMap((event): EventOccurrence[] => {
    if (event.recurrence !== 'weekly') return [{ ...event, occurrence_date: null }];
    const startsAt = new Date(event.starts_at);
    return weeklyOccurrencesBetween(startsAt, from, to).map((occurrence) => {
      const offset = occurrence.getTime() - startsAt.getTime();
      return {
        ...event,
        starts_at: occurrence.getTime(),
        ends_at: event.ends_at == null ? null : event.ends_at + offset,
        occurrence_date: occurrenceDate(occurrence),
      };
    });
  }).sort((a, b) => a.starts_at - b.starts_at);
}
