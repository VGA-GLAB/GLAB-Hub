import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecentGames, parseReviewList } from '../plugins/volputas/contracts.ts';
import {
  PROJECT_REVIEW_COMMENT_MAX,
  digestComment,
} from '../plugins/volputas/review-digest.ts';

/** cwd に依存せずリポジトリ内のソースを読む (他の contract test と同じ流儀)。 */
const readSource = (relative: string): string =>
  readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

const valid = [
  {
    id: 'v1', gameTitle: 'Elden Ring', recommend: true, comment: 'good',
    glabProjectId: null, createdAt: '2026-07-30T00:00:00Z', author: { name: 'Alice' },
  },
  {
    id: 'v2', gameTitle: 'KZS', recommend: false, comment: 'hard',
    glabProjectId: 'p-1', createdAt: '2026-07-30T01:00:00Z', author: { pseudo: 'px' },
  },
];

test('parseReviewList accepts a fully-populated payload', () => {
  const out = parseReviewList(valid);
  assert.ok(out);
  assert.equal(out.length, 2);
  assert.equal(out[1].glabProjectId, 'p-1');
});

test('parseReviewList rejects entries with a missing field', () => {
  const broken = [{ ...valid[0] }];
  delete (broken[0] as Record<string, unknown>).recommend;
  assert.equal(parseReviewList(broken), null);
});

test('parseReviewList rejects an author without name or pseudo', () => {
  assert.equal(parseReviewList([{ ...valid[0], author: {} }]), null);
});

test('parseReviewList rejects a non-array payload', () => {
  assert.equal(parseReviewList(null), null);
  assert.equal(parseReviewList({ ok: true, data: [] }), null);
});

test('parseRecentGames accepts a bare array and rejects malformed entries', () => {
  const games = parseRecentGames([{ name: 'KZS', playtimeTwoWeeksMinutes: 42 }]);
  assert.deepEqual(games, [{ name: 'KZS', playtimeTwoWeeksMinutes: 42 }]);
  assert.equal(parseRecentGames([{ name: 'KZS', playtimeTwoWeeksMinutes: '42' }]), null);
  assert.equal(parseRecentGames({ ok: true, data: [] }), null);
});

test('volputas proxy exposes the reviews routes', () => {
  const src = readSource('plugins/volputas/index.ts');
  assert.ok(src.includes("routes.get('/reviews'"), 'GET /reviews route missing');
  assert.ok(src.includes("routes.post('/reviews'"), 'POST /reviews route missing');
  assert.ok(src.includes("routes.get('/recent-games'"), 'GET /recent-games route missing');
});

test('review submission form sends explicit visibility', () => {
  const src = readSource('plugins/volputas/panel.ts');
  assert.ok(
    src.includes("visibility: 'community'"),
    'visibility community opt-in missing in panel',
  );
});

test('a ?projectId= deep link opens the reviews tab', () => {
  const src = readSource('plugins/volputas/panel.ts');
  assert.ok(
    /projectFilter \? 'reviews' : 'game_review'/.test(src),
    'projects card の導線で来たら感想タブを初期表示する必要がある',
  );
});

test('clearing the project filter also drops projectId from the URL', () => {
  const src = readSource('plugins/volputas/panel.ts');
  assert.ok(
    src.includes("url.searchParams.delete('projectId')"),
    '解除を URL に書き戻さないと再 mount で絞り込みが巻き戻る',
  );
});

test('projects card calls the volputas proxy at its module mount point', () => {
  const src = readSource('plugins/projects/panel.ts');
  assert.ok(
    src.includes('/api/x/volputas/reviews'),
    'projects card must use the /api/x/<moduleId> mount point',
  );
  assert.ok(
    !/fetch\(`\/api\/volputas/.test(src),
    'projects card must not call an unmounted /api/volputas path',
  );
});

test('projects card hands off projectId without navigating away', () => {
  const src = readSource('plugins/projects/panel.ts');
  assert.ok(
    src.includes("url.searchParams.set('projectId', project.id)"),
    'projects card must write projectId into the current URL for the volputas panel',
  );
  assert.ok(
    !/href = `\/\?projectId=/.test(src),
    'hub のタブは URL から復元しないので、 / への遷移はパネル状態を捨てるだけになる',
  );
});

test('every reviews spec clause is referenced from the implementation', () => {
  // spec 側で「実装関数は clause ID を @implements で参照する」と宣言しているので、
  // 参照されない clause が残らないことをここで固定する。
  const sources = [
    'plugins/volputas/index.ts',
    'plugins/volputas/panel.ts',
    'plugins/volputas/contracts.ts',
    'plugins/volputas/review-digest.ts',
    'plugins/projects/panel.ts',
  ].map(readSource).join('\n');
  const spec = readSource('spec/interface/volputas-connector.md');
  const clauses = [...new Set(spec.match(/SPEC-VOLPUTAS-REVIEWS-\d{3}/g) ?? [])];
  assert.ok(clauses.length > 0, 'spec に clause ID が無い');
  for (const clause of clauses) {
    assert.ok(
      sources.includes(`@implements ${clause}`),
      `${clause} を @implements で参照する実装が無い`,
    );
  }
});

test('digestComment truncates only when the comment is longer than the limit', () => {
  const short = 'あ'.repeat(PROJECT_REVIEW_COMMENT_MAX);
  assert.equal(digestComment(short), short);
  const long = 'あ'.repeat(PROJECT_REVIEW_COMMENT_MAX + 1);
  assert.equal(digestComment(long), `${'あ'.repeat(PROJECT_REVIEW_COMMENT_MAX)}…`);
});

test('digestComment does not split a surrogate pair', () => {
  // 絵文字は UTF-16 で 2 code unit。 code unit で切ると壊れた片割れが残る。
  // 判定は「対になっていないサロゲート」だけを拾う (完全な絵文字の前半は正常)。
  const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const digest = digestComment('🎮'.repeat(PROJECT_REVIEW_COMMENT_MAX + 5));
  assert.ok(
    !loneSurrogate.test(digest),
    'ダイジェストにサロゲートの片割れを残してはいけない',
  );
  assert.equal([...digest].length, PROJECT_REVIEW_COMMENT_MAX + 1);
});

test('projects card truncates the review digest at the documented length', () => {
  const src = readSource('plugins/projects/panel.ts');
  assert.ok(
    src.includes('digestComment(review.comment'),
    'projects card must run the digest through digestComment',
  );
  const spec = readSource('spec/interface/volputas-connector.md');
  assert.ok(
    spec.includes(`先頭 ${PROJECT_REVIEW_COMMENT_MAX} 文字で切り詰める`),
    'spec に書いた長さと実装の定数を揃える',
  );
});
