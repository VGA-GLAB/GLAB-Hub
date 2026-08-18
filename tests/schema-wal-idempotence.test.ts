// spec/test/strategy.md「自動テストの重点 1」: plugins/data.ts を *実 SQLite* で検証する。
//
// GLAB の SQLite は Web hub (Corpus ctx.db) と Discord Bot (自前 better-sqlite3) の
// 2 接続が同じ WAL ファイルを共有し、それぞれ起動時に ensureSchema() を呼ぶ
// (plugins/data.ts 冒頭)。ここでは Node 組み込みの node:sqlite で同じ構図
// (WAL ファイル + 2 接続) を作り、
//   - ensureSchema が何度・どの接続から呼ばれても冪等 (CREATE IF NOT EXISTS / 列追加)
//   - 片方の接続で書いた行がもう片方から読める (WAL 越しの CRUD)
//   - 一意キーの二度目 (nonce / attendance / review relay) が偽装なく false になる
// を、fake DB ではなく本物の SQL で担保する。
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import {
  closeJob,
  createJob,
  createProject,
  ensureSchema,
  getJob,
  getProject,
  getProjectWithMembers,
  listJobs,
  listProjects,
  markReviewRelayPosted,
  queueReviewRelay,
  recordAttendance,
  removeProjectMember,
  reserveAttendanceNonce,
  reviewsForNotification,
  updateProject,
  upsertProjectMember,
  type SqlDb,
} from '../plugins/data.ts';

/** GLAB_SCHEMA + ensureSchema が作る glab_* テーブル (どちらの接続からも同じ集合が見えること)。 */
const EXPECTED_TABLES = [
  'glab_user',
  'glab_attendance',
  'glab_gateway',
  'glab_attendance_nonce',
  'glab_job',
  'glab_project',
  'glab_project_member',
  'glab_project_release',
  'glab_tech_link',
  'glab_tech_link_tag',
  'glab_tech_link_comment',
  'glab_role_def',
  'glab_member_role',
  'glab_forum_thread',
  'glab_forum_comment',
  'glab_consult',
  'glab_review_relay',
];

function openWal(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 2000');
  return db;
}

function tableNames(db: SqlDb): string[] {
  return db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'glab_%' ORDER BY name`)
    .all()
    .map((row) => String((row as { name: unknown }).name));
}

function columnNames(db: SqlDb, table: string): string[] {
  return db.prepare('SELECT name FROM pragma_table_info(?)').all(table)
    .map((row) => String((row as { name: unknown }).name));
}

describe('plugins/data.ts — 実 SQLite (WAL) を hub / bot の 2 接続で共有する', () => {
  let dir!: string;
  let hub!: DatabaseSync;
  let bot!: DatabaseSync;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), 'glab-schema-'));
    hub = openWal(join(dir, 'corpus.db'));
    bot = openWal(join(dir, 'corpus.db'));
  });

  after(() => {
    if (bot) bot.close();
    if (hub) hub.close();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('ensureSchema はどの接続から何度呼んでも冪等で、同じテーブル集合が両接続から見える', () => {
    // hub が先に初期化 → bot が後から同じスキーマを流す (起動順は不定なので逆も同じはず)
    assert.doesNotThrow(() => ensureSchema(hub));
    assert.doesNotThrow(() => ensureSchema(bot));
    assert.doesNotThrow(() => ensureSchema(hub));
    assert.doesNotThrow(() => ensureSchema(bot));

    const fromHub = tableNames(hub);
    const fromBot = tableNames(bot);
    assert.deepEqual(fromHub, fromBot);
    for (const table of EXPECTED_TABLES) {
      assert.ok(fromHub.includes(table), `${table} が作られていない`);
    }
  });

  it('後付け列 (ALTER TABLE) も再実行で重複追加せず、旧スキーマからの起動を吸収する', () => {
    // 旧バージョンの DB を模す: 後付け列を落としたテーブルを別ファイルに作る
    const legacyDir = mkdtempSync(join(tmpdir(), 'glab-legacy-'));
    let legacy: DatabaseSync | undefined;
    try {
      legacy = openWal(join(legacyDir, 'corpus.db'));
      const legacyDb = legacy;
      legacyDb.exec(`CREATE TABLE glab_project (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL,
        repo_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`);
      assert.doesNotThrow(() => ensureSchema(legacyDb));
      const once = columnNames(legacyDb, 'glab_project');
      assert.ok(once.includes('description_synced_at'));
      assert.ok(once.includes('description_manual'));
      assert.ok(once.includes('releases_synced_at'));

      // 2 度目 (= もう片方の接続の起動) で列が二重に足されない
      assert.doesNotThrow(() => ensureSchema(legacyDb));
      assert.deepEqual(columnNames(legacyDb, 'glab_project'), once);
      const userCols = columnNames(legacyDb, 'glab_user');
      assert.equal(userCols.filter((c) => c === 'attendance_event_id').length, 1);
    } finally {
      legacy?.close();
      rmSync(legacyDir, { recursive: true, force: true });
    }
  });

  it('glab_job: hub で作成 → bot から読み取り・クローズ (WAL 越しの CRUD)', () => {
    const id = createJob(hub, { company: 'ACME', position: 'Programmer', postedBy: 'user-1' });
    assert.ok(id > 0);

    const seenByBot = getJob(bot, id);
    assert.ok(seenByBot, 'bot 接続から hub の書き込みが見えない');
    assert.equal(seenByBot.company, 'ACME');
    assert.equal(seenByBot.status, 'open');

    assert.equal(closeJob(bot, id), true);
    assert.equal(getJob(hub, id)?.status, 'closed');
    assert.equal(listJobs(hub, { status: 'open' }).some((j) => j.id === id), false);
    // 存在しない id のクローズは false (成功を偽装しない)
    assert.equal(closeJob(hub, 999999), false);
  });

  it('glab_project / glab_project_member: 作成・更新・メンバー upsert・削除が両接続で一致する', () => {
    const project = createProject(hub, { name: 'Sample Game', description: 'desc', repoUrl: null });
    assert.equal(getProject(bot, project.id)?.name, 'Sample Game');

    const updated = updateProject(bot, project.id, {
      name: 'Sample Game 2',
      description: 'desc2',
      status: 'paused',
      repoUrl: 'https://github.com/example/sample',
    });
    assert.equal(updated?.status, 'paused');
    assert.equal(getProject(hub, project.id)?.repo_url, 'https://github.com/example/sample');
    assert.equal(
      updateProject(hub, 'missing', { name: 'x', description: null, status: 'active', repoUrl: null }),
      null,
    );

    upsertProjectMember(hub, project.id, 'user-1', 'member');
    upsertProjectMember(bot, project.id, 'user-1', 'producer'); // 同じ人の 2 度目は上書き (重複行にしない)
    const withMembers = getProjectWithMembers(hub, project.id);
    assert.ok(withMembers);
    assert.equal(withMembers.members.length, 1);
    assert.equal(withMembers.members[0].role, 'producer');

    assert.equal(removeProjectMember(bot, project.id, 'user-1'), true);
    assert.equal(removeProjectMember(bot, project.id, 'user-1'), false);
    assert.equal(getProjectWithMembers(hub, project.id)?.members.length, 0);
    assert.ok(listProjects(bot).some((p) => p.id === project.id));
  });

  it('一意キーの二度目は false: nonce replay / 同日同施設の出席 / review relay の再送', () => {
    const now = Date.now();
    assert.equal(reserveAttendanceNonce(hub, 'nonce-1', now), true);
    assert.equal(reserveAttendanceNonce(bot, 'nonce-1', now), false); // 別接続からの replay も弾く

    const attendance = {
      userId: 'user-2',
      date: '2026-08-18',
      facilityId: 'room-a',
      checkedInAt: now,
      source: 'passkey' as const,
    };
    assert.equal(recordAttendance(hub, attendance), true);
    assert.equal(recordAttendance(bot, attendance), false);

    const review = {
      reviewId: 'rev-1',
      projectId: null,
      gameTitle: 'Sample Game',
      recommend: true,
      excerpt: 'good',
      author: 'anon',
      url: 'https://example.invalid/reviews/rev-1',
    };
    assert.equal(queueReviewRelay(hub, review), true);
    assert.equal(queueReviewRelay(bot, review), false);

    // bot scheduler の視点: 未投稿だけ拾い、投稿済みにしたら消える
    assert.ok(reviewsForNotification(bot).some((r) => r.reviewId === 'rev-1'));
    markReviewRelayPosted(bot, 'rev-1', 'msg-1');
    assert.equal(reviewsForNotification(hub).some((r) => r.reviewId === 'rev-1'), false);
  });
});
