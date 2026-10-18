import assert from 'node:assert/strict';
import test from 'node:test';
import { diAccessHeaders } from '../plugins/di/transport.ts';
import { VersionedHttpServiceConnector } from '../plugins/service-health-connector.ts';

test('Access credentials require a complete pair and HTTPS', () => {
  const values: Record<string, string> = { DISCUTERE_CF_ACCESS_CLIENT_ID: 'id' };
  const env = (key: string): string | undefined => values[key];
  assert.throws(() => diAccessHeaders(env, 'https://di.example'));
  values.DISCUTERE_CF_ACCESS_CLIENT_SECRET = 'secret';
  assert.throws(() => diAccessHeaders(env, 'http://di.example'));
  assert.equal(diAccessHeaders(env, 'https://di.example')['CF-Access-Client-Id'], 'id');
  assert.deepEqual(diAccessHeaders(() => undefined, null), {});
});

test('Di health rejects login HTML and forbids redirects', async () => {
  const original = globalThis.fetch;
  const connector = new VersionedHttpServiceConnector({
    id: 'discutere', title: 'Di', scope: 'multi', baseUrl: 'https://di.example',
    healthPath: '/health', requireJsonHealth: true,
  });
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(options?.redirect, 'error');
      return new Response('<html>Sign in</html>', { status: 200 });
    };
    assert.equal((await connector.health()).status, 'degraded');
    globalThis.fetch = async () => Response.json({ ok: true, version: '1' });
    assert.equal((await connector.health()).status, 'up');
    globalThis.fetch = async () => Response.json({ ok: false });
    assert.equal((await connector.health()).status, 'degraded');
  } finally {
    globalThis.fetch = original;
  }
});
