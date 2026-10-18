import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from '../corpus/server/hub/sdk.ts';
import { registerConclusionRoutes } from '../plugins/di/conclusion-routes.ts';
import { conclusionEndpoint, parsePublishedConclusions } from '../plugins/di/conclusion-contract.ts';

test('result contract allows only public audiences and strips internal data', () => {
  const row = { id: 'flow:one', title: 'Title', conclusion: 'Result', updatedAt: 1, scope: 'glab', transcript: 'internal' };
  assert.deepEqual(parsePublishedConclusions({ conclusions: [row] }), [{ id: row.id, title: row.title, conclusion: row.conclusion, updatedAt: 1, scope: 'glab' }]);
  assert.equal(parsePublishedConclusions({ conclusions: [{ ...row, scope: 'private' }] }), null);
  assert.equal(conclusionEndpoint('http://di.example'), null);
  assert.equal(conclusionEndpoint('https://user:password@di.example'), null);
  assert.equal(conclusionEndpoint('https://di.example/di/')?.pathname, '/di/api/integrations/glab/conclusions');
});

test('login is required; credentials stay on the server; revocation is fetched again', async () => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    if (c.req.header('x-test-user')) {
      c.set('userToken', 'session');
      c.set('auth', { userId: 'student', externalId: 'student', role: 'general', projectKey: null, isAdmin: false, displayName: null });
    }
    await next();
  });
  let calls = 0;
  let revoked = false;
  const request: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(new Headers(init?.headers).get('authorization'), `Bearer ${'s'.repeat(40)}`);
    assert.equal(init?.redirect, 'error');
    assert.equal(new URL(String(url)).searchParams.get('id'), 'flow:one');
    return revoked ? Response.json({ error: 'not_found' }, { status: 404 }) : Response.json({ conclusions: [{ id: 'flow:one', title: 'Title', conclusion: 'Result', updatedAt: 1, scope: 'glab' }] });
  };
  registerConclusionRoutes(app, 'https://di.example/', 's'.repeat(40), request);
  assert.equal((await app.request('/conclusions?id=flow:one')).status, 401);
  assert.equal(calls, 0);
  const first = await app.request('/conclusions?id=flow:one', { headers: { 'x-test-user': 'student' } });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'private, no-store');
  assert.equal((await first.text()).includes('s'.repeat(40)), false);
  revoked = true;
  assert.equal((await app.request('/conclusions?id=flow:one', { headers: { 'x-test-user': 'student' } })).status, 404);
  assert.equal(calls, 2);
});
