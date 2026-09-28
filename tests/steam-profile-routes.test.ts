import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono } from '../corpus/server/hub/sdk.ts';
import type { CorpusContext } from '../corpus/server/hub/sdk.ts';
import { registerSteamProfileRoutes } from '../plugins/vantan-user/steam-profile-routes.ts';
import type { CernereProjectApi } from '../plugins/cernere/shared-owner.ts';

function appFor(client: CernereProjectApi): Hono {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('auth', { userId: 'owner', externalId: 'owner', role: 'general',
      displayName: null, projectKey: null, isAdmin: false });
    await next();
  });
  registerSteamProfileRoutes(app, { logger: { error: () => {} } } as unknown as CorpusContext, client);
  return app;
}
const profile = { steamId: '76561198000000001', playedGamesPublic: true, steamIdPublic: false };

test('Steam routes use the authenticated owner, reject user selection and disable caching', async () => {
  const writes: unknown[][] = [];
  const client: CernereProjectApi = {
    getUserData: async (userId) => { assert.equal(userId, 'owner'); return {}; },
    setUserData: async (...args) => { writes.push(args); }, call: async () => ({}),
  };
  const app = appFor(client);
  const get = await app.request('/steam-profile?userId=other');
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('cache-control'), 'private, no-store');
  const put = (body: unknown) => app.request('/steam-profile?userId=other', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await put({ ...profile, userId: 'other' })).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await put(profile)).status, 200);
  assert.equal(writes[0]?.[0], 'owner');
  assert.equal(writes[0]?.[1], 'volputas');
  client.getUserData = async () => { throw new Error('private upstream detail'); };
  const failed = await app.request('/steam-profile');
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await failed.json(), { error: 'steam_profile_unavailable' });
});
