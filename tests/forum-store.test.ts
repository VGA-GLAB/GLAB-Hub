// spec/plan/2026-08-18-cleanup-backlog.md D3: glab_forum_thread /
// glab_forum_comment の CRUD を実 SQLite で検証する。 可視性 (canSee) は
// tests/audience-visibility.test.ts が担保しているので、 ここは並び順と
// スレッド削除時のコメント巻き取りに絞る。

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  deleteThread,
  findThread,
  insertComment,
  insertThread,
  listComments,
  listThreads,
  pinThread,
} from '../plugins/forum/store.ts';
import { openTempDb, type TempDb } from './sqlite-fixture.ts';

const newThread = (id: string, title: string, body: string, createdAt: number) => ({
  id,
  title,
  body,
  audienceRolesJson: JSON.stringify([]),
  createdBy: 'user-1',
  createdAt,
});

describe('glab_forum store', () => {
  let temp!: TempDb;

  before(() => { temp = openTempDb('glab-forum-'); });
  after(() => { temp?.close(); });

  it('inserts a thread and reads it back', () => {
    const created = insertThread(temp.db, newThread('t1', 'Unity の描画', '影が出ない', 1_000));

    assert.equal(created.title, 'Unity の描画');
    assert.equal(created.pinned, 0);
    assert.equal(findThread(temp.db, 't1')?.body, '影が出ない');
    assert.equal(findThread(temp.db, 'missing'), null);
  });

  it('orders pinned threads first, then newest', () => {
    insertThread(temp.db, newThread('t2', 'Blender の書き出し', 'fbx が壊れる', 2_000));
    insertThread(temp.db, newThread('t3', '就活の相談', 'ポートフォリオ', 3_000));

    assert.deepEqual(listThreads(temp.db).map((row) => row.id), ['t3', 't2', 't1']);
    assert.equal(pinThread(temp.db, 't1'), true);
    assert.deepEqual(listThreads(temp.db).map((row) => row.id), ['t1', 't3', 't2']);
    // 存在しないスレッドの pin は成功を偽装しない
    assert.equal(pinThread(temp.db, 'missing'), false);
  });

  it('matches the search term against both the title and the body', () => {
    assert.deepEqual(listThreads(temp.db, 'Blender').map((row) => row.id), ['t2']);
    assert.deepEqual(listThreads(temp.db, 'ポートフォリオ').map((row) => row.id), ['t3']);
    assert.deepEqual(listThreads(temp.db, '該当なし'), []);
    // 空文字は絞り込みなし扱い
    assert.equal(listThreads(temp.db, '  ').length, 3);
  });

  it('lists comments oldest first', () => {
    insertComment(temp.db, { id: 'c2', threadId: 't1', body: '二番目', createdBy: 'user-2', createdAt: 2_000 });
    insertComment(temp.db, { id: 'c1', threadId: 't1', body: '最初', createdBy: 'user-1', createdAt: 1_000 });
    insertComment(temp.db, { id: 'c3', threadId: 't2', body: '別スレ', createdBy: 'user-1', createdAt: 3_000 });

    assert.deepEqual(listComments(temp.db, 't1').map((row) => row.id), ['c1', 'c2']);
    assert.deepEqual(listComments(temp.db, 't2').map((row) => row.body), ['別スレ']);
  });

  it('deletes a thread together with its comments', () => {
    deleteThread(temp.db, 't1');

    assert.equal(findThread(temp.db, 't1'), null);
    assert.deepEqual(listComments(temp.db, 't1'), []);
    // 他スレッドのコメントは残る
    assert.equal(listComments(temp.db, 't2').length, 1);
  });
});
