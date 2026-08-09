import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGameList, parseEmotionCurveList, parseMediaTicket } from '../plugins/volputas/contracts.ts';

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function game(overrides: Record<string, unknown> = {}) {
  return {
    id: '3f1a2b4c-5d6e-4f70-8192-a3b4c5d6e7f8',
    title: 'Uni Quest',
    team: 'GLAB 3年',
    platform: 'PC',
    description: null,
    storeUrl: null,
    glabProjectId: null,
    isActive: true,
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  };
}

test('a well-formed game list parses', () => {
  const games = parseGameList({ ok: true, data: [game()] });
  assert.equal(games?.length, 1);
  assert.equal(games?.[0].title, 'Uni Quest');
});

test('a game missing its publication flag is rejected rather than half-rendered', () => {
  const { isActive, ...withoutFlag } = game();
  assert.equal(parseGameList({ ok: true, data: [withoutFlag] }), null);
  assert.equal(parseGameList({ ok: false, data: [] }), null);
  assert.equal(parseGameList([game()]), null);
});

test('an emotion curve list keeps entry order and evaluation', () => {
  const records = parseEmotionCurveList({
    ok: true,
    data: [{
      id: 'r1',
      gameTitle: 'Uni Quest',
      gameId: null,
      mode: 'video',
      entries: [
        { timeSeconds: 5, stamp: 'hype', comment: '' },
        { timeSeconds: 40, stamp: null, comment: 'ここで詰まった' },
      ],
      evaluation: { summary: 'ok' },
      createdAt: '2026-08-09T00:00:00.000Z',
    }],
  });

  assert.equal(records?.[0].entries.length, 2);
  assert.equal(records?.[0].entries[1].stamp, null);
  assert.deepEqual(records?.[0].evaluation, { summary: 'ok' });
});

test('an unknown mode is rejected', () => {
  assert.equal(parseEmotionCurveList({
    ok: true,
    data: [{
      id: 'r1',
      gameTitle: 'Uni Quest',
      mode: 'live',
      entries: [],
      createdAt: '2026-08-09T00:00:00.000Z',
    }],
  }), null);
});

test('the ticket is extracted from the Volputas-side URL', () => {
  // Volputas は自分のパスで URL を返す。 GLAB の中継口へ付け替えて使うので、
  // 取り出すのはチケットだけ。
  const url = '/api/v1/integrations/glab/evidence/media/videos/r1?ticket=abc.def.ghi';
  assert.equal(parseMediaTicket({ ok: true, data: { url } }), 'abc.def.ghi');
  assert.equal(parseMediaTicket({ ok: true, data: { url: '/no-query' } }), null);
  assert.equal(parseMediaTicket({ ok: false }), null);
});

test('game master writes are admin-gated at the hub as well', () => {
  const src = readSource('plugins/volputas/index.ts');
  for (const route of [
    "routes.post('/games', requireAdmin",
    "routes.patch('/games/:id', requireAdmin",
    "routes.post('/surveys', requireAdmin",
    "routes.patch('/surveys/:id', requireAdmin",
  ]) {
    assert.ok(src.includes(route), `admin gate missing: ${route}`);
  }
});

test('inactive games have a dedicated admin-only route', () => {
  const src = readSource('plugins/volputas/index.ts');
  assert.ok(src.includes("routes.get('/games/admin', requireAdmin"));
  assert.ok(src.includes("c.req.query('includeInactive') !== undefined"));
});

test('media travels through the streaming proxy, not the text one', () => {
  const src = readSource('plugins/volputas/index.ts');
  // proxy() は本文を文字列として読むので、 動画に使うと壊れる。
  assert.ok(
    /routes\.put\('\/evidence\/media\/:kind\/:recordId', \(c\) => proxyStream\(/.test(src),
    'video upload must use proxyStream',
  );
  assert.ok(
    /routes\.get\('\/evidence\/media\/:kind\/:recordId', \(c\) => proxyStream\(/.test(src),
    'video playback must use proxyStream',
  );
});

test('the streaming proxy declares duplex so Node accepts a streamed body', () => {
  const src = readSource('plugins/shared.ts');
  assert.ok(src.includes("duplex?: string }).duplex = 'half'"), 'duplex declaration missing');
});

test('the streaming proxy preserves video byte-range semantics without exposing internal errors', () => {
  const src = readSource('plugins/shared.ts');
  assert.ok(src.includes("c.req.header('range')"), 'request range must reach Volputas');
  assert.ok(src.includes("responseHeaders.set('content-range', contentRange)"), 'partial response range missing');
  assert.ok(src.includes("responseHeaders.set('accept-ranges', acceptRanges)"), 'seek capability missing');
  assert.ok(!src.includes('detail: String(e)'), 'connector exceptions must not reach clients');
});

test('the recorder posts the record before uploading the video', () => {
  const src = readSource('plugins/volputas/emotion-curve-panel.ts');
  // 動画の置き場が記録 ID で決まるため、 この順序は入れ替えられない。
  const recordAt = src.indexOf("ctx.api('/evidence/emotion-curves'");
  const uploadAt = src.indexOf('/evidence/media/videos/');
  const evaluateAt = src.indexOf('/evaluate`');
  assert.ok(recordAt > 0 && uploadAt > recordAt && evaluateAt > uploadAt);
});

test('the object URL of a replaced video is released', () => {
  const src = readSource('plugins/volputas/emotion-curve-panel.ts');
  assert.ok(src.includes('URL.revokeObjectURL(objectUrl)'), 'object URL leak');
});
