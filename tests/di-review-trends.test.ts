import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  parseDiReviewTrends,
  sanitizeDiReviewTrends,
} from '../plugins/di/review-trend-contract.ts';

test('Di trend parser accepts only anonymous seven-day aggregates', () => {
  const valid = {
    ok: true,
    source: 'discutere',
    windowDays: 7,
    data: [{
      gameSlug: 'elden-ring',
      appId: 1245620,
      recentReviewCount: 4,
      positivePercent: 75,
      latestReviewAt: '2026-08-25T00:00:00.000Z',
    }],
  };
  assert.deepEqual(parseDiReviewTrends(valid), valid.data);
  assert.equal(parseDiReviewTrends({ ...valid, source: 'steam' }), null);
  assert.equal(parseDiReviewTrends({ ...valid, data: [{ ...valid.data[0], positivePercent: 101 }] }), null);
  assert.equal(parseDiReviewTrends({ ...valid, data: [{ ...valid.data[0], content: 'review text' }] }), null);
  assert.deepEqual(
    sanitizeDiReviewTrends({
      ...valid,
      internalTrace: 'not relayed',
      data: [{ ...valid.data[0], email: 'not relayed' }],
    }),
    valid,
  );
});
