import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Context, CorpusContext, ServiceConnector } from '../corpus/server/hub/sdk.ts';
import { bookingProxy } from '../plugins/facility/booking-proxy.ts';

const secret = randomBytes(48).toString('base64url');
const body = JSON.stringify({ visibility: 'internal', group: { kind: 'team', id: 'p1' } });
function context(token: string | null = 'current-user-token'): Context {
  return {
    get: (key: string) => key === 'userToken' ? token : key === 'auth' ? { userId: 'current-user' } : undefined,
    req: { method: 'POST', url: 'http://glab.test/reservations', text: async () => body,
      header: () => 'untrusted-caller-assertion' },
  } as unknown as Context;
}
function corpus(key: string | undefined = secret): CorpusContext {
  return { env: () => key, logger: { error() {} }, tokenProvider: { mode: 'test', getDownstreamToken: async () => 'delegated' } } as unknown as CorpusContext;
}
function connector(fetch: ServiceConnector['fetch']): ServiceConnector {
  return { id: 'aedilis', title: 'Aedilis', baseUrl: 'http://aedilis.test', scope: 'multi', fetch, health: async () => ({ status: 'up' }) };
}

test('anonymous callers and old servers cannot create a silently public booking', async () => {
  let calls = 0;
  const downstream = connector(async () => { calls++; return Response.json({}); });
  assert.equal((await bookingProxy(context(null), corpus(), downstream, '/api/reservations')).status, 401);
  assert.equal(calls, 0);
  assert.equal((await bookingProxy(context(), corpus(), downstream, '/api/reservations', async () => assert.fail('must not read groups'))).status, 503);
  assert.equal(calls, 1);
});

test('the relay binds verified groups to the actual user, request and freshly delegated token', async () => {
  const groups = [{ kind: 'team' as const, id: 'p1', name: 'Team one' }];
  let writes = 0;
  const downstream = connector(async (path, init) => {
    if (path === '/api/reservations/capabilities') return Response.json({ groupContextVersion: 1 });
    writes++;
    assert.equal(path, '/api/reservations');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer delegated');
    const [encoded, signature] = (headers.get('x-glab-booking-context') ?? '').split('.');
    assert.ok(encoded); assert.ok(signature);
    assert.equal(signature, createHmac('sha256', secret).update(encoded).digest('base64url'));
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    assert.equal(payload.userId, 'current-user'); assert.deepEqual(payload.groups, groups);
    assert.equal(payload.method, 'POST'); assert.equal(payload.path, path);
    assert.equal(payload.bodyHash, createHash('sha256').update(body).digest('hex'));
    assert.equal(init?.body, body);
    return Response.json({ reservation: { id: 'new' } }, { status: 201 });
  });
  const response = await bookingProxy(context(), corpus(), downstream, '/api/reservations', async () => groups);
  assert.equal(response.status, 201); assert.equal(writes, 1);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('membership failure cannot be turned into a public or anonymous fallback', async () => {
  let calls = 0;
  const downstream = connector(async () => { calls++; return Response.json({ groupContextVersion: 1 }); });
  const response = await bookingProxy(context(), corpus(), downstream, '/api/reservations', async () => { throw new Error('sensitive upstream error'); });
  assert.equal(response.status, 503); assert.equal(calls, 1);
  assert.equal((await response.text()).includes('sensitive'), false);
});
