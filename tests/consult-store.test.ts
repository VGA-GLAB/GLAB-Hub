// spec/plan/2026-08-18-cleanup-backlog.md D2: glab_consult の CRUD を実 SQLite で
// 検証する。 相談は hub (作成・解決) と bot (スレッド作成の ack) の 2 者が同じ行を
// 触るので、 「二度目の ack を成功と偽装しない」 ことが要になる。

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  consultsPendingPost,
  consultsPendingResolveNotice,
  findConsult,
  hasRecentConsult,
  insertConsult,
  listConsultsByStatus,
  markConsultPosted,
  markConsultResolved,
  markConsultResolvedPosted,
} from '../plugins/consult/store.ts';
import { openTempDb, type TempDb } from './sqlite-fixture.ts';

const newConsult = (id: string, createdAt: number, createdBy = 'user-1') => ({
  id,
  title: `title ${id}`,
  body: `body ${id}`,
  createdBy,
  createdAt,
  invitedJson: '[]',
});

describe('glab_consult store', () => {
  let temp!: TempDb;

  before(() => { temp = openTempDb('glab-consult-'); });
  after(() => { temp?.close(); });

  it('inserts an open consult and reads it back', () => {
    const row = insertConsult(temp.db, newConsult('c1', 1_000));

    assert.equal(row.status, 'open');
    assert.equal(row.thread_id, null);
    assert.equal(row.posted_at, null);
    assert.equal(findConsult(temp.db, 'c1')?.title, 'title c1');
    assert.equal(findConsult(temp.db, 'missing'), null);
  });

  it('reports a recent consult only inside the rate-limit window', () => {
    assert.equal(hasRecentConsult(temp.db, 'user-1', 999), true);
    assert.equal(hasRecentConsult(temp.db, 'user-1', 1_000), false);
    assert.equal(hasRecentConsult(temp.db, 'user-2', 0), false);
  });

  it('lists by status, newest first', () => {
    insertConsult(temp.db, newConsult('c2', 2_000));

    assert.deepEqual(listConsultsByStatus(temp.db, 'open').map((row) => row.id), ['c2', 'c1']);
    assert.deepEqual(listConsultsByStatus(temp.db, 'resolved'), []);
  });

  it('returns only unposted open consults to the bot, and records the thread once', () => {
    assert.deepEqual(consultsPendingPost(temp.db).map((row) => row.id), ['c1', 'c2']);

    assert.equal(markConsultPosted(temp.db, 'c1', 'thread-1', 3_000), true);
    // 二度目はスレッドを付け替えない
    assert.equal(markConsultPosted(temp.db, 'c1', 'thread-2', 4_000), false);
    assert.equal(findConsult(temp.db, 'c1')?.thread_id, 'thread-1');
    assert.deepEqual(consultsPendingPost(temp.db).map((row) => row.id), ['c2']);
  });

  it('moves a consult to the resolved feed until the bot acknowledges it', () => {
    markConsultResolved(temp.db, 'c1', 5_000);
    assert.equal(findConsult(temp.db, 'c1')?.status, 'resolved');
    assert.equal(findConsult(temp.db, 'c1')?.resolved_at, 5_000);
    assert.deepEqual(consultsPendingResolveNotice(temp.db).map((row) => row.id), ['c1']);

    assert.equal(markConsultResolvedPosted(temp.db, 'c1', 6_000), true);
    // ack 済みを返し続けると bot が同じスレッドを毎 tick 再アーカイブする
    assert.deepEqual(consultsPendingResolveNotice(temp.db), []);
    assert.equal(markConsultResolvedPosted(temp.db, 'c1', 7_000), false);
  });

  it('never reports a resolved consult that has no thread yet', () => {
    markConsultResolved(temp.db, 'c2', 8_000);

    assert.deepEqual(consultsPendingResolveNotice(temp.db), []);
    assert.equal(markConsultResolvedPosted(temp.db, 'missing', 9_000), false);
  });
});
