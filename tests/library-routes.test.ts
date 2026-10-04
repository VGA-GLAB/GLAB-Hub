import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { Hono, type ServiceConnector, type TokenProvider } from '../corpus/server/hub/sdk.ts';
import { libraryRoutes } from '../plugins/library/routes.ts';

const incoming = randomBytes(24).toString('hex');
const delegated = randomBytes(24).toString('hex');
function app(fetch: ServiceConnector['fetch'], authenticated: boolean, provider?: TokenProvider): Hono {
  const root = new Hono();
  root.use('*', async (c, next) => { if (authenticated) c.set('userToken', incoming); await next(); });
  const connector: ServiceConnector = {
    id: 'bibliotheca', title: 'Bibliotheca', baseUrl: 'http://bibliotheca.test', scope: 'multi',
    fetch, health: async () => ({ status: 'up' }),
  };
  root.route('/', libraryRoutes(connector, provider ?? {
    mode: 'test', async getDownstreamToken(token, target) {
      assert.equal(token, incoming); assert.equal(target.projectKey, 'bibliotheca');
      return delegated;
    },
  }));
  return root;
}

test('anonymous read and borrowing never contact Bibliotheca', async () => {
  const router = app(async () => assert.fail('anonymous upstream request'), false);
  for (const [path, method] of [['/equipment', 'GET'], ['/lookup?source=book&key=123', 'GET'], ['/loans/mine', 'GET'], ['/loans', 'POST']]) {
    const response = await router.request(path!, { method });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});

test('borrowing delegates the user credential without forwarding cookies', async () => {
  const payload = JSON.stringify({ source: 'equipment', external_key: 'BB-EXAMPLE' });
  const router = app(async (path, init) => {
    assert.equal(path, '/api/loans'); assert.equal(init?.method, 'POST'); assert.equal(init?.body, payload);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), `Bearer ${delegated}`);
    assert.equal(headers.get('cookie'), null);
    return Response.json({ loan: { id: 1 } }, { status: 201 });
  }, true);
  const response = await router.request('/loans', { method: 'POST', body: payload,
    headers: { 'content-type': 'application/json', cookie: 'untrusted=value' } });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('token failure cannot downgrade to anonymous and admin operations are not exposed', async () => {
  const router = app(async () => assert.fail('unexpected upstream request'), true,
    { mode: 'test', getDownstreamToken: async () => null });
  assert.equal((await router.request('/loans/mine?all=1')).status, 503);
  assert.equal((await router.request('/loans/1/return', { method: 'POST' })).status, 404);
  assert.equal((await router.request('/equipment', { method: 'POST' })).status, 404);
});
