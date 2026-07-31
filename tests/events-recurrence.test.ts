import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expandOccurrences, weeklyOccurrencesBetween } from '../plugins/events/recurrence.ts';

const base = {
  id: 1,
  starts_at: new Date('2026-07-06T10:00:00+09:00').getTime(),
  ends_at: new Date('2026-07-06T12:00:00+09:00').getTime(),
  recurrence: 'weekly' as const,
};

test('weeklyOccurrencesBetween lists matching weekdays in a half-open range', () => {
  const occurrences = weeklyOccurrencesBetween(
    new Date(base.starts_at),
    new Date('2026-07-06T00:00:00+09:00'),
    new Date('2026-07-27T00:00:00+09:00'),
  );
  assert.equal(occurrences.length, 3);
});

test('weeklyOccurrencesBetween does not include dates before the first occurrence', () => {
  const occurrences = weeklyOccurrencesBetween(
    new Date(base.starts_at),
    new Date('2026-06-01T00:00:00+09:00'),
    new Date('2026-07-14T00:00:00+09:00'),
  );
  assert.ok(occurrences.every((date) => date.getTime() >= base.starts_at));
});

test('weeklyOccurrencesBetween preserves the original local time of day', () => {
  const [occurrence] = weeklyOccurrencesBetween(
    new Date(base.starts_at),
    new Date('2026-07-13T00:00:00+09:00'),
    new Date('2026-07-20T00:00:00+09:00'),
  );
  assert.ok(occurrence);
  assert.equal(occurrence.getHours(), new Date(base.starts_at).getHours());
  assert.equal(occurrence.getMinutes(), new Date(base.starts_at).getMinutes());
});

test('expandOccurrences adds occurrence dates only for weekly events', () => {
  const weekly = expandOccurrences([base] as never, new Date('2026-07-06T00:00:00+09:00'), new Date('2026-07-27T00:00:00+09:00'));
  assert.equal(weekly.length, 3);
  assert.ok(weekly.every((event) => event.occurrence_date));
  const once = expandOccurrences([{ ...base, recurrence: 'none' }] as never, new Date('2026-07-01'), new Date('2026-07-31'));
  assert.equal(once.length, 1);
  assert.equal(once[0]?.occurrence_date, null);
});

test('weeklyOccurrencesBetween keeps the occurrence that starts exactly at `from`', () => {
  // from が「初回から丁度 n 週後」でも取りこぼさない (週数の丸めがずれると 1 件落ちる)。
  for (const weeks of [1, 2, 5, 30]) {
    const from = new Date(base.starts_at);
    from.setDate(from.getDate() + weeks * 7);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    const occurrences = weeklyOccurrencesBetween(new Date(base.starts_at), from, to);
    assert.deepEqual(occurrences.map((date) => date.getTime()), [from.getTime()]);
  }
});

test('expandOccurrences shifts the end time by the same offset as the start', () => {
  const duration = base.ends_at - base.starts_at;
  const events = expandOccurrences(
    [base] as never,
    new Date('2026-07-06T00:00:00+09:00'),
    new Date('2026-07-27T00:00:00+09:00'),
  );
  assert.ok(events.length > 1);
  for (const event of events) {
    assert.equal((event.ends_at ?? 0) - event.starts_at, duration);
  }
});
