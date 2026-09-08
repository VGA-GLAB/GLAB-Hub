import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeCalliopeConnector } from '../plugins/progress/connector.ts';
import { readProgress } from '../plugins/progress/relay.ts';

test('Calliope token absence prevents every downstream data fetch but leaves public health available', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    return Response.json({ status: 'ok' });
  };
  try {
    for (const token of [undefined, '', ' \t ']) {
      const connector = makeCalliopeConnector((key) => key === 'CALLIOPE_BASE_URL' ? 'https://calliope.test' : token);
      const reply = await readProgress(connector);
      assert.equal(reply.status, 503);
      assert.equal((await reply.json()).error, 'service_token_unavailable');
      assert.match(reply.headers.get('cache-control') ?? '', /no-store/);
      assert.equal(calls, 0);
    }
    await makeCalliopeConnector((key) => key === 'CALLIOPE_BASE_URL' ? 'https://calliope.test' : 'secret').health();
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
