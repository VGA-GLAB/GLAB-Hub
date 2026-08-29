import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { GameView } from '../plugins/volputas/contracts.ts';
import {
  mergeReviewSuggestions,
  steamAppIdFromStoreUrl,
} from '../plugins/volputas/review-suggestions.ts';

test('Steam Store URL parsing accepts only the fixed HTTPS app path', () => {
  assert.equal(steamAppIdFromStoreUrl('https://store.steampowered.com/app/1245620/ELDEN_RING/'), 1245620);
  assert.equal(steamAppIdFromStoreUrl('http://store.steampowered.com/app/1245620'), null);
  assert.equal(steamAppIdFromStoreUrl('https://example.com/app/1245620'), null);
  assert.equal(steamAppIdFromStoreUrl('https://store.steampowered.com/sub/1245620'), null);
});

test('review suggestions merge trends and recent play without exposing unregistered games', () => {
  const game = {
    id: 'game-1',
    title: 'ELDEN RING',
    team: null,
    platform: 'PC',
    description: null,
    storeUrl: 'https://store.steampowered.com/app/1245620/ELDEN_RING/',
    glabProjectId: null,
    isActive: true,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
  } satisfies GameView;

  const suggestions = mergeReviewSuggestions(
    [game],
    [
      { name: 'elden ring', playtimeTwoWeeksMinutes: 30 },
      { name: 'Unregistered Game', playtimeTwoWeeksMinutes: 999 },
    ],
    [{
      gameSlug: 'elden-ring',
      appId: 1245620,
      recentReviewCount: 4,
      positivePercent: 75,
      latestReviewAt: '2026-08-25T00:00:00.000Z',
    }],
  );

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0]?.gameId, game.id);
  assert.equal(suggestions[0]?.gameTitle, game.title);
  assert.match(suggestions[0]?.detail ?? '', /直近7日 4件.*最近プレイ 30分/);
});
