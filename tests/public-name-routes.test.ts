import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono, type CorpusContext } from '../corpus/server/hub/sdk.ts';
import type { CernereProjectApi } from '../plugins/cernere/shared-owner.ts';
import { registerPublicNameRoutes } from '../plugins/vantan-user/public-name-routes.ts';

test('public name routes restrict identity and fields, validate names and hide upstream errors', async () => {
  const calls: unknown[][] = [];
  const client: CernereProjectApi = {
    getUserData: async () => ({}), setUserData: async () => {},
    call: async (...args) => { calls.push(args); return { displayName: 'Neco' }; },
  };
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('auth', { userId: 'owner', externalId: 'owner', role: 'general',
      displayName: null, projectKey: null, isAdmin: false });
    await next();
  });
  registerPublicNameRoutes(app, { logger: { error: () => {} } } as unknown as CorpusContext, client);
  const read = await app.request('/public-name?userId=other');
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await read.json(), { publicName: 'Neco' });
  assert.deepEqual(calls[0], ['profile', 'get', { userId: 'owner', fields: ['displayName'] }]);
  const put = (body: unknown) => app.request('/public-name?userId=other', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  for (const body of [{ publicName: ' ' }, { publicName: 'x'.repeat(201) },
    { publicName: 'Neco', userId: 'other' }, { publicName: 'Neco', role: 'admin' }]) {
    assert.equal((await put(body)).status, 400);
  }
  assert.equal(calls.length, 1);
  assert.equal((await put({ publicName: ' New name ' })).status, 200);
  assert.deepEqual(calls[1], ['profile', 'update', { userId: 'owner', displayName: 'New name' }]);
  client.call = async () => { throw new Error('private detail'); };
  const failed = await put({ publicName: 'Neco' });
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: 'public_name_unavailable' });
});
