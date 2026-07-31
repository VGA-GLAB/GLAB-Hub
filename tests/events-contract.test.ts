import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const text = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('events restrict visibility and exclude role-limited reminders', async () => {
  const [routes, store] = await Promise.all([text('plugins/events/index.ts'), text('plugins/events/store.ts')]);
  assert.match(routes, /canSee\(audience\(event\.audience_roles\)/);
  assert.match(store, /audience_roles IS NULL OR audience_roles = '\[\]'/);
  assert.match(store, /markOccurrenceNotified/);
});

test('the event range is bounded before weekly occurrences are expanded', async () => {
  const routes = await text('plugins/events/index.ts');
  assert.match(routes, /MAX_EVENT_RANGE_MS/, '無制限の from/to を受けると occurrence 展開が発散する');
  assert.match(routes, /invalid_event_range/);
});

test('every event consumer applies the audience rule, not just GET /events', async () => {
  const [command, attendance] = await Promise.all([
    text('bot/commands/event.ts'),
    text('plugins/attendance/index.ts'),
  ]);
  // Discord は役職を解決できないので、 /event list も役職限定イベントを出してはいけない。
  assert.match(command, /parseAudience\(event\.audience_roles\)/);
  // 進行中イベントの提示 / 出席記録も同じ規則で絞る。
  assert.match(attendance, /canSee\(\s*parseAudience\(event\.audience_roles\)/);
  assert.equal(
    attendance.match(/findActive\(\)/g)?.length,
    1,
    'ルートは findActive を直接呼ばず visibleActiveEvent 1 箇所を経由すること',
  );
});

test('the store list signature is options-based everywhere it is called', async () => {
  const [command, routes] = await Promise.all([
    text('bot/commands/event.ts'),
    text('plugins/events/index.ts'),
  ]);
  assert.ok(!/\.list\((?:true|false)\)/.test(command + routes), 'list() は EventListOptions を取る');
});

test('findActive does not drop single events that started long ago', async () => {
  const store = await text('plugins/events/store.ts');
  const body = store.slice(store.indexOf('async findActive'));
  assert.ok(!/this\.list\(/.test(body.slice(0, body.indexOf('markOccurrenceNotified'))),
    'list() の開始日時下限は長時間イベントを落とすので findActive では使わない');
  assert.match(body, /recurrence = 'weekly' OR ends_at > \$1/);
});

test('the events panel calls another module API with the authenticated helper', async () => {
  const panel = await text('plugins/events/panel.ts');
  assert.match(panel, /ctx\.hubApi\('\/api\/x\/roles\/defs'\)/);
  assert.ok(!/[^.]\bfetch\('\/api/.test(panel), '素の fetch は認証ヘッダが付かない');
});
