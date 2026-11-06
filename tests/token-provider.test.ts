import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CernereDelegationTokenProvider } from '../corpus/server/hub/tokens.ts';
import { boundTestSession } from './bound-user-fixture.ts';

test('uses the opaque local session and explicit target origin, preserving a base path in the bound envelope', async () => {
  const session = boundTestSession(); let calls = 0;
  const provider = new CernereDelegationTokenProvider({ delegate: async (token, target, operation) => {
    calls++; assert.equal(token, session.token);
    assert.deepEqual(target, { projectKey: 'volputas', audience: 'http://localhost:8892' });
    assert.equal(operation.path, '/prefix/records'); assert.equal(operation.action, 'records.read');
    return { delegationToken: 'd'.repeat(43), requestId: '11111111-1111-4111-8111-111111111111', expiresAt: new Date(Date.now() + 30_000).toISOString() };
  } });
  const result = await provider.authorize(session, { service: 'volputas', projectKey: 'volputas', baseUrl: 'http://localhost:8892/prefix/' },
    { path: '/records', action: 'records.read' });
  assert.ok(result); assert.equal(calls, 1); assert.equal(result.path, '/records');
  assert.equal(new Headers(result.init.headers).get('authorization'), `Cernere-Delegation ${'d'.repeat(43)}`);
});
test('authority failure yields no request, retry, reusable token or anonymous fallback', async () => {
  let calls = 0;
  const provider = new CernereDelegationTokenProvider({ delegate: async () => { calls++; throw new Error('Private credential detail'); } });
  const target = { service: 'volputas', projectKey: 'volputas', baseUrl: 'http://localhost:8892' };
  assert.equal(await provider.authorize(boundTestSession(), target, { path: '/records', action: 'records.read' }), null);
  assert.equal(calls, 1);
  assert.equal(await provider.authorize(null, target, { path: '/records', action: 'records.read' }), null);
  assert.equal(calls, 1);
});
