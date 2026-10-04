import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRelaySessions, parseRelaySessions, type FetchLike } from '../plugins/odeum/relay-client.ts';
import contract from '../contracts/odeum-relay-client.contract.ts';

test('relay sessions are read with the service ticket as Bearer', async () => {
  const seen: Array<{ url: string; auth: string | null }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    seen.push({ url, auth: new Headers(init?.headers).get('authorization') });
    return Response.json([
      { sid: 's1', presenter_connected: true, viewer_count: 3, started_at: '2026-10-04T03:00:00Z' },
      { sid: 's2', presenter_connected: false, viewer_count: 0, started_at: 1_000 },
      { bogus: true },
    ]);
  };
  const sessions = await fetchRelaySessions('http://127.0.0.1:4400/', 'service.jws.ticket', fetchImpl);
  assert.equal(contract.post(sessions), true);
  assert.deepEqual(seen, [{ url: 'http://127.0.0.1:4400/v1/sessions', auth: 'Bearer service.jws.ticket' }]);
  assert.deepEqual(sessions?.get('s1'), {
    sid: 's1', presenterConnected: true, viewerCount: 3, startedAt: Date.parse('2026-10-04T03:00:00Z'),
  });
  assert.equal(sessions?.get('s2')?.presenterConnected, false);
  assert.equal(sessions?.size, 2);
});

test('an unreachable or broken relay degrades to null instead of throwing', async () => {
  const failures: FetchLike[] = [
    async () => { throw new TypeError('fetch failed'); },
    async () => new Response('unauthorized', { status: 401 }),
    async () => new Response('not json', { status: 200 }),
    async () => Response.json({ sessions: [] }),
  ];
  for (const fetchImpl of failures) {
    const result = await fetchRelaySessions('http://127.0.0.1:4400/', 't', fetchImpl);
    assert.equal(result, null);
    assert.equal(contract.post(result), true);
  }
});

test('a slow relay is cut off by the timeout', async () => {
  const fetchImpl: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });
  assert.equal(await fetchRelaySessions('http://127.0.0.1:4400/', 't', fetchImpl, 10), null);
});

test('parseRelaySessions clamps viewer counts', () => {
  assert.equal(parseRelaySessions([{ sid: 'x', viewer_count: -4.5 }])?.get('x')?.viewerCount, 0);
  assert.equal(parseRelaySessions(null), null);
});
