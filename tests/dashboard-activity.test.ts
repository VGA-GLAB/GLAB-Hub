// ダッシュボードの集約は専用表を持たず、 既存プラグインの表を UNION して畳む。
// 表が 1 つ増減しただけで「本人以外の行が混ざる」「新しい順が崩れる」 が起きる
// ので、 実 SQLite に他人の行と自分の行を混ぜて確かめる。

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { SqlDb } from '../plugins/data.ts';
import {
  listMemberRoles,
  listRecentActivity,
  readActivityStats,
} from '../plugins/dashboard/activity.ts';
import { openTempDb, type TempDb } from './sqlite-fixture.ts';

const ME = 'user-me';
const OTHER = 'user-other';

function seed(db: SqlDb): void {
  db.prepare(
    `INSERT INTO glab_attendance (id, user_id, date, facility_id, checked_in_at, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('a1', ME, '2026-08-17', 'shibuya', 1_000, 'passkey');
  db.prepare(
    `INSERT INTO glab_attendance (id, user_id, date, facility_id, checked_in_at, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('a2', ME, '2026-08-18', 'shibuya', 2_000, 'manual');
  db.prepare(
    `INSERT INTO glab_attendance (id, user_id, date, facility_id, checked_in_at, source)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run('a3', OTHER, '2026-08-18', 'shibuya', 2_500, 'passkey');

  const insertLink = db.prepare(
    `INSERT INTO glab_tech_link (id, url, title, posted_by, source, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, 'web', ?, ?, ?)`,
  );
  insertLink.run('l1', 'https://example.com/a', '生きているリンク', ME, 3_000, 3_000, null);
  insertLink.run('l2', 'https://example.com/b', '消したリンク', ME, 3_500, 3_500, 4_000);

  db.prepare(
    `INSERT INTO glab_tech_link_comment (id, link_id, user_id, body, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('lc1', 'l1', ME, 'コメント', 5_000);
  // 削除済みリンクへのコメントは、 対象が見えないので出さない。
  db.prepare(
    `INSERT INTO glab_tech_link_comment (id, link_id, user_id, body, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('lc2', 'l2', ME, '消えたリンクへのコメント', 5_500);

  db.prepare(
    `INSERT INTO glab_forum_thread (id, title, body, created_by, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('t1', 'スレッド', '本文', ME, 6_000);
  db.prepare(
    `INSERT INTO glab_forum_comment (id, thread_id, body, created_by, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('fc1', 't1', '返信', ME, 7_000);

  db.prepare(
    `INSERT INTO glab_consult (id, title, body, status, created_by, created_at)
     VALUES (?, ?, ?, 'open', ?, ?)`,
  ).run('c1', '相談', '本文', ME, 8_000);

  db.prepare(
    `INSERT INTO glab_project (id, name, status, created_at, updated_at)
     VALUES (?, ?, 'active', ?, ?)`,
  ).run('p1', 'ゲームA', 100, 100);
  db.prepare(
    `INSERT INTO glab_project_member (project_id, user_id, role, created_at)
     VALUES (?, ?, 'member', ?)`,
  ).run('p1', ME, 9_000);
  db.prepare(
    `INSERT INTO glab_project_member (project_id, user_id, role, created_at)
     VALUES (?, ?, 'producer', ?)`,
  ).run('p1', OTHER, 9_500);

  db.prepare(
    'INSERT INTO glab_member_role (user_id, role, created_at) VALUES (?, ?, ?)',
  ).run(ME, 'student', 10);
  db.prepare(
    'INSERT INTO glab_member_role (user_id, role, created_at) VALUES (?, ?, ?)',
  ).run(ME, 'lead', 10);
}

describe('dashboard activity', () => {
  let temp!: TempDb;

  before(() => {
    temp = openTempDb('glab-dashboard-');
    seed(temp.db);
  });
  after(() => { temp?.close(); });

  it('returns only my rows, newest first', () => {
    const activity = listRecentActivity(temp.db, ME, 20);

    assert.deepEqual(
      activity.map((a) => a.kind),
      [
        'project-join',
        'consult',
        'forum-comment',
        'forum-thread',
        'tech-link-comment',
        'tech-link',
        'attendance',
        'attendance',
      ],
    );
    assert.equal(activity.every((a) => a.at > 0), true);
    // 他人の出席 (2_500) は自分の 2_000 より新しいが、 混ざってはいけない。
    assert.equal(activity.some((a) => a.at === 2_500), false);
  });

  it('hides entries whose target was deleted', () => {
    const titles = listRecentActivity(temp.db, ME, 20).map((a) => a.title);

    assert.equal(titles.includes('消したリンク'), false);
    assert.equal(titles.filter((t) => t === '生きているリンク').length, 2);
  });

  it('keeps the attendance source as detail', () => {
    const attendance = listRecentActivity(temp.db, ME, 20)
      .filter((a) => a.kind === 'attendance');

    assert.deepEqual(attendance.map((a) => a.detail), ['manual', 'passkey']);
  });

  it('honours the limit', () => {
    assert.equal(listRecentActivity(temp.db, ME, 3).length, 3);
    // 打ち切っても新しい順の先頭から取る。
    assert.equal(listRecentActivity(temp.db, ME, 3)[0]?.kind, 'project-join');
  });

  it('keeps an activity recorded at the Unix epoch', () => {
    temp.db.prepare(
      `INSERT INTO glab_attendance (id, user_id, date, facility_id, checked_in_at, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('a4', 'user-epoch', '1970-01-01', 'shibuya', 0, 'manual');

    assert.deepEqual(listRecentActivity(temp.db, 'user-epoch', 20), [{
      kind: 'attendance', title: 'shibuya', at: 0, detail: 'manual',
    }]);
  });

  it('counts attendance by day inside the window', () => {
    const stats = readActivityStats(temp.db, ME, 0);

    assert.equal(stats.attendanceDays30, 2);
    assert.equal(stats.projects, 1);
    assert.equal(stats.techLinks, 1);
    assert.equal(stats.forumPosts, 2);
  });

  it('excludes attendance older than the window', () => {
    const stats = readActivityStats(temp.db, ME, 1_500);

    assert.equal(stats.attendanceDays30, 1);
  });

  it('returns nothing for a user with no history', () => {
    const stats = readActivityStats(temp.db, 'user-empty', 0);

    assert.deepEqual(listRecentActivity(temp.db, 'user-empty', 20), []);
    assert.deepEqual(stats, {
      attendanceDays30: 0, projects: 0, techLinks: 0, forumPosts: 0,
    });
  });

  it('lists my roles in the defined order', () => {
    assert.deepEqual(
      listMemberRoles(temp.db, ME).map((r) => r.key),
      ['lead', 'student'],
    );
  });
});
