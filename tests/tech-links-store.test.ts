// spec/plan/2026-08-18-cleanup-backlog.md D5: glab_tech_link /
// glab_tech_link_tag / glab_tech_link_comment の CRUD を実 SQLite で検証する。
// 検索は LIKE を組み立てるので、 メタ文字がパターンとして効いてしまわないことを
// 本物の SQLite に対して固定する (tests/tech-links-contract.test.ts はソース検査のみ)。

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  createLink,
  findLink,
  findSharedLink,
  insertLinkComment,
  listLinkComments,
  listLinks,
  listTagCounts,
  replaceTags,
  softDeleteLink,
  tagsFor,
  unshareLink,
  updateLink,
} from '../plugins/tech-links/store.ts';
import { openTempDb, type TempDb } from './sqlite-fixture.ts';

const ALL = { limit: 100, offset: 0 };

describe('glab_tech_link store', () => {
  let temp!: TempDb;
  let webId = '';
  let sharedId = '';

  before(() => { temp = openTempDb('glab-tech-links-'); });
  after(() => { temp?.close(); });

  it('normalizes the URL and stores the tags lowercased', () => {
    const link = createLink(
      temp.db,
      {
        url: 'HTTPS://Example.COM/unity/?utm_source=x',
        title: 'Unity の描画メモ',
        summary: 'URP の影',
        tags: ['Unity', 'unity', 'Rendering'],
      },
      'user-1',
      'web',
      null,
    );

    assert.ok(link);
    webId = link.id;
    assert.equal(link.url, 'https://example.com/unity');
    assert.equal(link.source, 'web');
    assert.equal(link.source_ref, null);
    assert.deepEqual(tagsFor(temp.db, link.id), ['rendering', 'unity']);
  });

  it('rejects a URL that cannot be normalized', () => {
    assert.equal(createLink(temp.db, { url: 'javascript:alert(1)', title: 'x' }, 'user-1', 'web', null), null);
  });

  it('filters by tag and by free text, and escapes LIKE metacharacters', () => {
    const second = createLink(
      temp.db,
      { url: 'https://example.com/blender', title: '100% Blender 入門', tags: ['blender'] },
      'user-2',
      'web',
      null,
    );
    assert.ok(second);

    assert.deepEqual(listLinks(temp.db, { ...ALL, tag: 'unity' }).map((row) => row.id), [webId]);
    assert.deepEqual(listLinks(temp.db, { ...ALL, q: 'Blender' }).map((row) => row.id), [second.id]);
    // % は「任意の文字列」ではなくリテラルとして照合される
    assert.deepEqual(listLinks(temp.db, { ...ALL, q: '100%' }).map((row) => row.id), [second.id]);
    assert.deepEqual(listLinks(temp.db, { ...ALL, q: '%' }).map((row) => row.id), [second.id]);
    // 新しい順・件数制限
    assert.equal(listLinks(temp.db, { limit: 1, offset: 0 }).length, 1);
    assert.equal(listLinks(temp.db, { limit: 100, offset: 2 }).length, 0);
  });

  it('keeps unspecified fields on patch and replaces the tag set', () => {
    const before2 = findLink(temp.db, webId);
    assert.ok(before2);

    updateLink(temp.db, before2, { title: 'Unity の描画メモ v2' });
    const after2 = findLink(temp.db, webId);
    assert.equal(after2?.title, 'Unity の描画メモ v2');
    assert.equal(after2?.summary, 'URP の影', 'summary 未指定なら据え置き');

    replaceTags(temp.db, webId, ['URP']);
    assert.deepEqual(tagsFor(temp.db, webId), ['urp']);
  });

  it('stores comments oldest first', () => {
    insertLinkComment(temp.db, { id: 'lc2', linkId: webId, userId: 'user-2', body: '後', createdAt: 2_000 });
    insertLinkComment(temp.db, { id: 'lc1', linkId: webId, userId: 'user-1', body: '先', createdAt: 1_000 });

    assert.deepEqual(listLinkComments(temp.db, webId).map((row) => row.id), ['lc1', 'lc2']);
    assert.deepEqual(listLinkComments(temp.db, 'missing'), []);
  });

  it('shares a Memoria link at most once per source_ref and poster', () => {
    const shared = createLink(
      temp.db,
      { url: 'https://example.com/memoria', title: 'Memoria から共有', tags: ['memo'] },
      'user-1',
      'memoria',
      'note-1',
    );
    assert.ok(shared);
    sharedId = shared.id;

    assert.equal(findSharedLink(temp.db, 'note-1', 'user-1')?.id, sharedId);
    // 別の人の共有は別の行
    assert.equal(findSharedLink(temp.db, 'note-1', 'user-2'), null);
    assert.equal(findSharedLink(temp.db, 'note-unknown', 'user-1'), null);
  });

  it('counts tags only for links that are still visible', () => {
    const counts = new Map(listTagCounts(temp.db).map((row) => [row.tag, row.count]));
    assert.equal(counts.get('urp'), 1);
    assert.equal(counts.get('memo'), 1);
    assert.equal(counts.get('unity'), undefined, '差し替え前のタグは残らない');
  });

  it('deletes logically: the row stays but drops out of every read path', () => {
    assert.equal(softDeleteLink(temp.db, webId), true);
    assert.equal(findLink(temp.db, webId), null);
    assert.equal(listLinks(temp.db, ALL).some((row) => row.id === webId), false);
    assert.equal(listTagCounts(temp.db).some((row) => row.tag === 'urp'), false);
    // 二度目は false (削除済みを再削除したことにしない)
    assert.equal(softDeleteLink(temp.db, webId), false);
    assert.equal(
      temp.db.prepare('SELECT COUNT(*) AS n FROM glab_tech_link WHERE id = ?').all(webId)
        .map((r) => (r as { n: number }).n)[0],
      1,
      '行そのものは残す',
    );
  });

  it('unshares only the caller own Memoria link', () => {
    assert.equal(unshareLink(temp.db, 'note-1', 'user-2'), false);
    assert.equal(findSharedLink(temp.db, 'note-1', 'user-1')?.id, sharedId);

    assert.equal(unshareLink(temp.db, 'note-1', 'user-1'), true);
    assert.equal(findSharedLink(temp.db, 'note-1', 'user-1'), null);
    assert.equal(unshareLink(temp.db, 'note-1', 'user-1'), false);
  });
});
