import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_TILES, sanitizeTendentiaMap } from '../plugins/tendentia/map-contract.ts';

const tile = {
  key: 'game:steam:1',
  title: 'Example Game',
  subtitle: null,
  url: 'https://example.com/game',
  metric: '1,000',
  genre: 'game',
  sourceId: 'steam',
  sourceName: 'Steam',
  rank: 1,
  movement: { status: 'new', delta: null },
  interest: 0.8,
  reasons: ['複数のサイトで話題'],
};

const payload = {
  map: {
    lastCrawledAt: '2026-10-14T00:00:00.000Z',
    prefs: { genres: { game: 1 }, keywords: ['secret-keyword'] },
    genres: [{ genre: 'game', label: 'ゲーム', weight: 1, count: 1 }],
    tiles: [tile],
  },
  busy: false,
};

test('Tendentia map is projected onto the display columns only', () => {
  assert.deepEqual(sanitizeTendentiaMap(payload), {
    lastCrawledAt: '2026-10-14T00:00:00.000Z',
    busy: false,
    genres: [{ genre: 'game', label: 'ゲーム', count: 1 }],
    tiles: [{
      title: 'Example Game',
      subtitle: null,
      url: 'https://example.com/game',
      genre: 'game',
      sourceName: 'Steam',
      rank: 1,
      movement: 'new',
      interest: 0.8,
    }],
  });
  // 興味の設定 (prefs) や理由の文字列は GLab へ出さない。
  assert.equal(JSON.stringify(sanitizeTendentiaMap(payload)).includes('secret-keyword'), false);
});

test('Tendentia map rejects a wrong outer shape', () => {
  assert.equal(sanitizeTendentiaMap(null), null);
  assert.equal(sanitizeTendentiaMap({ map: { tiles: 'x', genres: [] } }), null);
  assert.equal(sanitizeTendentiaMap({ tiles: [], genres: [] }), null);
});

test('Tendentia map drops broken tiles and unsafe links one by one', () => {
  const view = sanitizeTendentiaMap({
    ...payload,
    map: {
      ...payload.map,
      tiles: [
        tile,
        { ...tile, title: '' },
        { ...tile, rank: 0 },
        { ...tile, genre: 'Game<script>' },
        { ...tile, url: 'javascript:alert(1)' },
        { ...tile, interest: 4, movement: { status: 'sideways' } },
      ],
    },
  });
  assert.ok(view);
  assert.equal(view.tiles.length, 3);
  assert.equal(view.tiles[1].url, null);
  assert.equal(view.tiles[2].interest, 1);
  assert.equal(view.tiles[2].movement, 'unknown');
});

test('Tendentia map caps the number of tiles', () => {
  const tiles = Array.from({ length: MAX_TILES + 5 }, (_, index) => ({ ...tile, rank: index + 1 }));
  const view = sanitizeTendentiaMap({ ...payload, map: { ...payload.map, tiles } });
  assert.equal(view?.tiles.length, MAX_TILES);
});
