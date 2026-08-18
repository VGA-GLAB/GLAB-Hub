import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANONYMOUS_AUTHOR,
  MAX_AUTHOR_LENGTH,
  MAX_EXCERPT_LENGTH,
  MAX_TITLE_LENGTH,
  parseCreatedReview,
  relayFromCreatedReview,
  reviewUrl,
  sanitizeMentions,
} from '../plugins/volputas/review-relay.ts';

/** Volputas `POST /api/v1/integrations/glab/reviews` の 201 応答 (routes/glabReviews.js)。 */
function created(record: Record<string, unknown>) {
  return { ok: true, data: { record } };
}

const community = {
  id: 'rev-1',
  gameTitle: 'Elden Ring',
  recommend: true,
  comment: 'good game',
  glabProjectId: 'proj-1',
  visibility: 'community',
  anonymous: false,
  createdAt: '2026-08-18T00:00:00Z',
};

test('parseCreatedReview accepts the Volputas 201 shape and ignores extra fields', () => {
  const record = parseCreatedReview(created({ ...community, tags: ['x'], polarity: 1 }));
  assert.ok(record);
  assert.equal(record.id, 'rev-1');
  assert.equal(record.glabProjectId, 'proj-1');
});

test('parseCreatedReview rejects bodies without a record (no silent relay of garbage)', () => {
  assert.equal(parseCreatedReview(null), null);
  assert.equal(parseCreatedReview({ ok: true }), null);
  assert.equal(parseCreatedReview(created({ gameTitle: 'x' })), null); // id 無し
});

test('relayFromCreatedReview builds a queue row that links back to GLAB (the front)', () => {
  const relay = relayFromCreatedReview(parseCreatedReview(created(community))!, {
    authorDisplayName: 'Alice',
    publicUrl: 'http://localhost:5187',
  });
  assert.deepEqual(relay, {
    reviewId: 'rev-1',
    projectId: 'proj-1',
    gameTitle: 'Elden Ring',
    recommend: true,
    excerpt: 'good game',
    author: 'Alice',
    url: 'http://localhost:5187/?projectId=proj-1',
  });
});

test('only community reviews are relayed', () => {
  for (const visibility of ['private', 'friends', undefined]) {
    const record = parseCreatedReview(created({ ...community, visibility }))!;
    assert.equal(
      relayFromCreatedReview(record, { authorDisplayName: 'Alice', publicUrl: 'http://localhost:5187' }),
      null,
      `visibility=${String(visibility)} must not relay`,
    );
  }
});

test('anonymous reviews never expose the display name; missing names fall back to Player', () => {
  const anon = relayFromCreatedReview(parseCreatedReview(created({ ...community, anonymous: true }))!, {
    authorDisplayName: 'Alice',
    publicUrl: 'http://localhost:5187',
  });
  assert.equal(anon?.author, ANONYMOUS_AUTHOR);
  const unnamed = relayFromCreatedReview(parseCreatedReview(created(community))!, {
    authorDisplayName: null,
    publicUrl: 'http://localhost:5187',
  });
  assert.equal(unnamed?.author, 'Player');
});

test('recommend outside true/false becomes null; missing project id links to the top page', () => {
  const relay = relayFromCreatedReview(
    parseCreatedReview(created({ ...community, recommend: null, glabProjectId: null }))!,
    { authorDisplayName: 'Alice', publicUrl: 'https://glab.example/' },
  );
  assert.equal(relay?.recommend, null);
  assert.equal(relay?.projectId, null);
  assert.equal(relay?.url, 'https://glab.example/');
});

test('mentions are neutralized and lengths are bounded before queueing', () => {
  const relay = relayFromCreatedReview(
    parseCreatedReview(created({
      ...community,
      gameTitle: 'T'.repeat(MAX_TITLE_LENGTH + 10),
      comment: `@everyone <@123> <@&456> ${'x'.repeat(MAX_EXCERPT_LENGTH + 50)}`,
    }))!,
    { authorDisplayName: `@here ${'A'.repeat(MAX_AUTHOR_LENGTH + 5)}`, publicUrl: 'http://localhost:5187' },
  );
  assert.ok(relay);
  assert.equal(relay.gameTitle.length, MAX_TITLE_LENGTH);
  assert.equal(relay.excerpt.length, MAX_EXCERPT_LENGTH);
  assert.equal(relay.author.length, MAX_AUTHOR_LENGTH);
  assert.doesNotMatch(relay.excerpt, /@everyone|<@123>|<@&456>/);
  assert.doesNotMatch(relay.author, /@here/);
  assert.equal(sanitizeMentions('hi @everyone <@1>'), 'hi @\u200beveryone <@\u200b1>');
});

test('relay truncation does not split emoji surrogate pairs', () => {
  const relay = relayFromCreatedReview(
    parseCreatedReview(created({
      ...community,
      gameTitle: `${'T'.repeat(MAX_TITLE_LENGTH - 1)}🎮`,
      comment: `${'x'.repeat(MAX_EXCERPT_LENGTH - 1)}🎮`,
    }))!,
    {
      authorDisplayName: `${'A'.repeat(MAX_AUTHOR_LENGTH - 1)}🎮`,
      publicUrl: 'http://localhost:5187',
    },
  );
  assert.ok(relay);
  for (const text of [relay.gameTitle, relay.excerpt, relay.author]) {
    assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(text), false, 'lone high surrogate');
    assert.equal(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text), false, 'lone low surrogate');
  }
});

test('without a usable public URL the relay is skipped instead of storing a broken link', () => {
  const record = parseCreatedReview(created(community))!;
  assert.equal(relayFromCreatedReview(record, { authorDisplayName: 'A', publicUrl: undefined }), null);
  assert.equal(relayFromCreatedReview(record, { authorDisplayName: 'A', publicUrl: 'not a url' }), null);
  assert.equal(reviewUrl('ftp://x', null), null);
  assert.equal(reviewUrl('http://localhost:5187/some/path', 'p'), 'http://localhost:5187/?projectId=p');
});
