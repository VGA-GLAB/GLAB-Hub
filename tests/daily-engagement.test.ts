import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isDailyNotificationDue,
  normalizeDailyNotifyAt,
  tokyoDateKey,
} from '../plugins/daily-engagement/catalog.ts';
import {
  completeDailyQuest,
  getOrCreateDailyContent,
  markDailyDiscordNotified,
} from '../plugins/daily-engagement/store.ts';
import { safePublicHttpUrl } from '../plugins/daily-engagement/public-url.ts';
import { formatDailyEngagementMessage } from '../bot/notify/daily-engagement-message.ts';
import { postDailyEngagementIfDue } from '../bot/notify/daily-engagement.ts';
import { openTempDb } from './sqlite-fixture.ts';

const CREDENTIAL_URL = ['https://user', ':placeholder@example.com/private'].join('');

test('全員に同じ日次クエストとスポットライトを返し、達成だけをユーザー別に持つ', () => {
  const temp = openTempDb('glab-daily-');
  try {
    temp.db.prepare(`INSERT INTO glab_project
      (id, name, description, status, repo_url, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)`).run(
      'project-a', 'Project A', 'A description', 'https://example.com/a', 1, 10,
    );
    temp.db.prepare(`INSERT INTO glab_project
      (id, name, description, status, repo_url, created_at, updated_at)
      VALUES (?, ?, ?, 'active', ?, ?, ?)`).run(
      'project-b', 'Project B', 'B description', 'https://example.com/b', 2, 20,
    );

    const alice = getOrCreateDailyContent(temp.db, '2026-08-26', 1_000, 'alice');
    const bob = getOrCreateDailyContent(temp.db, '2026-08-26', 1_001, 'bob');
    assert.deepEqual(alice.quest, bob.quest);
    assert.deepEqual(alice.spotlight, bob.spotlight);
    assert.equal(alice.spotlight?.id, 'project-b');

    assert.equal(completeDailyQuest(temp.db, alice.dateKey, 'alice', 1_100), true);
    assert.equal(completeDailyQuest(temp.db, alice.dateKey, 'alice', 1_200), false);
    assert.equal(getOrCreateDailyContent(temp.db, alice.dateKey, 1_300, 'alice').completed, true);
    assert.equal(getOrCreateDailyContent(temp.db, alice.dateKey, 1_300, 'bob').completed, false);

    const tomorrow = getOrCreateDailyContent(temp.db, '2026-08-27', 2_000, 'alice');
    assert.equal(tomorrow.spotlight?.id, 'project-a');
  } finally {
    temp.close();
  }
});

test('Discord 通知済み状態は最初の成功だけを記録する', () => {
  const temp = openTempDb('glab-daily-notify-');
  try {
    const daily = getOrCreateDailyContent(temp.db, '2026-08-26', 1_000);
    assert.equal(markDailyDiscordNotified(temp.db, daily.dateKey, 'message-1', 1_100), true);
    assert.equal(markDailyDiscordNotified(temp.db, daily.dateKey, 'message-2', 1_200), false);
    assert.equal(getOrCreateDailyContent(temp.db, daily.dateKey, 1_300).discordNotifiedAt, 1_100);
  } finally {
    temp.close();
  }
});

test('Discord 日次通知はメンションを無効化し、成功後の再投稿を防ぐ', async () => {
  const temp = openTempDb('glab-daily-post-');
  const sent: Array<{ content: string; allowedMentions?: { parse?: string[] } }> = [];
  const client = {
    channels: {
      fetch: async () => ({
        isTextBased: () => true,
        send: async (options: { content: string; allowedMentions?: { parse?: string[] } }) => {
          sent.push(options);
          return { id: 'message-1' };
        },
      }),
    },
  } as unknown as Parameters<typeof postDailyEngagementIfDue>[0];
  const cfg = {
    channels: { daily: 'daily-channel' },
    daily: { notifyAt: '09:00' },
    glabBaseUrl: 'https://example.com',
  };

  try {
    const now = new Date('2026-08-27T00:00:00Z');
    assert.equal(await postDailyEngagementIfDue(client, temp.db, cfg, now), 'posted');
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0]?.allowedMentions, { parse: [] });
    assert.equal(await postDailyEngagementIfDue(client, temp.db, cfg, now), 'already-posted');
    assert.equal(sent.length, 1);
  } finally {
    temp.close();
  }
});

test('日付境界は Asia/Tokyo で切り替わる', () => {
  assert.equal(tokyoDateKey(new Date('2026-08-25T14:59:59Z')), '2026-08-25');
  assert.equal(tokyoDateKey(new Date('2026-08-25T15:00:00Z')), '2026-08-26');
});

test('日次通知は Asia/Tokyo の設定時刻以降だけ due になる', () => {
  assert.equal(normalizeDailyNotifyAt('09:00'), '09:00');
  assert.equal(isDailyNotificationDue(new Date('2026-08-26T23:59:00Z'), '09:00'), false);
  assert.equal(isDailyNotificationDue(new Date('2026-08-27T00:00:00Z'), '09:00'), true);
  assert.throws(() => normalizeDailyNotifyAt('24:00'));
});

test('ダッシュボードは HTTP(S) 以外のプロジェクト URL をリンクにしない', () => {
  assert.equal(safePublicHttpUrl('javascript:alert(1)'), null);
  assert.equal(safePublicHttpUrl('data:text/html,unsafe'), null);
  assert.equal(safePublicHttpUrl(CREDENTIAL_URL), null);
  assert.equal(safePublicHttpUrl('https://example.com/project'), 'https://example.com/project');
});

test('Discord 日次通知は本文をエスケープし危険な URL を除外する', () => {
  const message = formatDailyEngagementMessage({
    dateKey: '2026-08-26',
    quest: { key: 'small-idea', title: '@everyone *title*', prompt: '# prompt', minutes: 5 },
    spotlight: {
      id: 'project-a',
      name: '@everyone **Project**',
      description: '[click](https://example.com)',
      repoUrl: 'javascript:alert(1)',
    },
    completed: false,
    discordNotifiedAt: null,
  }, CREDENTIAL_URL);

  // メンション解決は Discord send 側の allowedMentions: [] で無効化する。
  assert.ok(message.includes('@everyone'));
  assert.ok(message.includes('\\*\\*Project\\*\\*'));
  assert.ok(!message.includes('javascript:'));
  assert.ok(!message.includes('placeholder'));
});
