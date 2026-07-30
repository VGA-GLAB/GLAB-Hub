import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatReviewCard } from '../bot/format.ts';
import {
  markReviewRelayPosted,
  queueReviewRelay,
  reviewsForNotification,
  type NewReviewRelay,
  type ReviewRelayRow,
  type SqlDb,
  type SqlStatement,
} from '../plugins/data.ts';

/** cwd に依存せずリポジトリ内のソースを読む (他の contract test と同じ流儀)。 */
const readSource = (relative: string): string =>
  readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

function row(overrides: Partial<ReviewRelayRow> = {}): ReviewRelayRow {
  return {
    reviewId: 'r1', projectId: null, gameTitle: 'Elden Ring', recommend: 1,
    excerpt: 'good game', author: 'Alice', url: 'https://glab.example/reviews',
    createdAt: 0, postedAt: null, messageId: null,
    ...overrides,
  };
}

/** glab_review_relay の 3 クエリだけを解釈する最小フェイク (projects-data と同じ流儀)。 */
class ReviewRelayDb implements SqlDb {
  readonly rows = new Map<string, ReviewRelayRow>();
  private seq = 0;

  exec(): void {}

  prepare(sql: string): SqlStatement {
    return {
      get: () => undefined,
      all: (...params) => {
        if (!sql.includes('FROM glab_review_relay')) return [];
        return [...this.rows.values()]
          .filter((r) => r.postedAt === null)
          .sort((a, b) => a.createdAt - b.createdAt)
          .slice(0, Number(params[0]));
      },
      run: (...params) => {
        if (sql.includes('INSERT INTO glab_review_relay')) {
          const reviewId = String(params[0]);
          if (this.rows.has(reviewId)) return { lastInsertRowid: 0, changes: 0 };
          this.rows.set(reviewId, row({
            reviewId,
            projectId: (params[1] as string | null) ?? null,
            gameTitle: String(params[2]),
            recommend: params[3] as number | null,
            excerpt: String(params[4]),
            author: String(params[5]),
            url: String(params[6]),
            // Date.now() は同一 ms に潰れるので、 挿入順を保つ単調増加値を使う。
            createdAt: this.seq++,
          }));
          return { lastInsertRowid: 0, changes: 1 };
        }
        if (sql.includes('UPDATE glab_review_relay')) {
          const current = this.rows.get(String(params[2]));
          if (!current) return { lastInsertRowid: 0, changes: 0 };
          this.rows.set(current.reviewId, {
            ...current,
            postedAt: Number(params[0]),
            messageId: String(params[1]),
          });
          return { lastInsertRowid: 0, changes: 1 };
        }
        return { lastInsertRowid: 0, changes: 0 };
      },
    };
  }
}

const newReview = (overrides: Partial<NewReviewRelay> = {}): NewReviewRelay => ({
  reviewId: 'r1', projectId: null, gameTitle: 'Elden Ring', recommend: true,
  excerpt: 'good game', author: 'Alice', url: 'https://glab.example/reviews',
  ...overrides,
});

test('formatReviewCard renders the recommendation in japanese', () => {
  assert.match(formatReviewCard(row()), /おすすめ/);
  assert.match(formatReviewCard(row({ recommend: 0 })), /おすすめしない/);
  assert.match(formatReviewCard(row({ recommend: null })), /未評価/);
});

test('formatReviewCard includes the title, author and url', () => {
  const out = formatReviewCard(row());
  assert.ok(out.includes('Elden Ring'));
  assert.ok(out.includes('Alice'));
  assert.ok(out.includes('https://glab.example/reviews'));
});

test('formatReviewCard never exceeds the discord message limit', () => {
  const out = formatReviewCard(row({ excerpt: '感'.repeat(4_000) }));
  assert.ok(out.length <= 2_000, `expected <= 2000 chars, got ${out.length}`);
});

test('formatReviewCard keeps the attribution when the excerpt is truncated', () => {
  // 受け口が許す最大長 (2,000) の本文でも、 投稿者と URL は消えてはならない。
  const out = formatReviewCard(row({ excerpt: '感'.repeat(2_000) }));
  assert.ok(out.length <= 2_000, `expected <= 2000 chars, got ${out.length}`);
  assert.ok(out.includes('投稿者: Alice'), 'author must survive truncation');
  assert.ok(out.includes('https://glab.example/reviews'), 'url must survive truncation');
  assert.ok(out.includes('…'), 'truncation marker missing');
});

test('formatReviewCard never leaves a lone surrogate at the cut point', () => {
  // 絵文字 (サロゲートペア) を境界で割ると Discord に送れない文字列になる。
  const out = formatReviewCard(row({ excerpt: '🎮'.repeat(1_500) }));
  assert.ok(out.length <= 2_000);
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(out), false, 'lone high surrogate');
  assert.equal(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(out), false, 'lone low surrogate');
});

test('queueReviewRelay ignores a resent review id (idempotent webhook)', () => {
  const db = new ReviewRelayDb();
  assert.equal(queueReviewRelay(db, newReview()), true);
  assert.equal(queueReviewRelay(db, newReview({ excerpt: 'resent' })), false);
  assert.equal(db.rows.size, 1);
  assert.equal(db.rows.get('r1')?.excerpt, 'good game', '再送で既存行を上書きしない');
});

test('queueReviewRelay stores recommend as 0 / 1 / null', () => {
  const db = new ReviewRelayDb();
  queueReviewRelay(db, newReview({ reviewId: 'yes', recommend: true }));
  queueReviewRelay(db, newReview({ reviewId: 'no', recommend: false }));
  queueReviewRelay(db, newReview({ reviewId: 'unknown', recommend: null }));

  assert.equal(db.rows.get('yes')?.recommend, 1);
  assert.equal(db.rows.get('no')?.recommend, 0);
  assert.equal(db.rows.get('unknown')?.recommend, null);
});

test('reviewsForNotification returns unposted reviews oldest first, bounded by limit', () => {
  const db = new ReviewRelayDb();
  for (const reviewId of ['a', 'b', 'c']) queueReviewRelay(db, newReview({ reviewId }));

  assert.deepEqual(reviewsForNotification(db, 10).map((r) => r.reviewId), ['a', 'b', 'c']);
  assert.deepEqual(reviewsForNotification(db, 2).map((r) => r.reviewId), ['a', 'b']);
});

test('markReviewRelayPosted removes a review from the notification queue', () => {
  const db = new ReviewRelayDb();
  queueReviewRelay(db, newReview({ reviewId: 'a' }));
  queueReviewRelay(db, newReview({ reviewId: 'b' }));

  markReviewRelayPosted(db, 'a', 'discord-message-1');

  assert.deepEqual(reviewsForNotification(db, 10).map((r) => r.reviewId), ['b']);
  assert.equal(db.rows.get('a')?.messageId, 'discord-message-1');
  assert.notEqual(db.rows.get('a')?.postedAt, null);
});

test('the relay receiver is guarded by a service token', () => {
  const src = readSource('plugins/volputas/index.ts');
  assert.ok(
    /'\/external\/review-relay',\s*\n\s*requireServiceToken\(/.test(src),
    'requireServiceToken must be wired directly onto the review-relay route',
  );
});

test('the relay receiver initializes the shared schema it writes to', () => {
  const src = readSource('plugins/volputas/index.ts');
  assert.ok(/ensureSchema\(ctx\.db\)/.test(src), 'glab_review_relay 未作成だと受け口が 500 になる');
});

test('the relay table keeps review_id unique for idempotency', () => {
  const src = readSource('plugins/data.ts');
  assert.ok(/glab_review_relay/.test(src), 'relay table missing');
  assert.ok(/review_id[^\n]*PRIMARY KEY/i.test(src), 'review_id must be the primary key');
});

test('bot posts relayed reviews with every mention disabled', () => {
  const scheduler = readSource('bot/notify/scheduler.ts');
  const channels = readSource('bot/channels.ts');
  assert.ok(/markReviewRelayPosted\(db, review\.reviewId, messageId\)/.test(scheduler),
    'scheduler must only mark posted reviews after a successful send');
  assert.ok(/allowedMentions/.test(channels), 'postToChannel must support allowedMentions');
  assert.ok(/allowedMentions:\s*\{\s*parse:\s*\[\]\s*\}/.test(scheduler),
    'review posting must pass an empty allowedMentions parse list');
});
