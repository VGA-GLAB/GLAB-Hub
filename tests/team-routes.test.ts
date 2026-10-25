import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../corpus/server/db.ts';
import { Hono, type CorpusContext } from '../corpus/server/hub/sdk.ts';
import { ensureSchema, createProject, upsertProjectMember, removeProjectMember } from '../plugins/data.ts';
import { registerTeamRoutes } from '../plugins/projects/team-routes.ts';

test('TEAM uses existing membership and rejects nonmember direct URLs and revoked membership', async () => {
  const db = openDb(':memory:');
  try {
    ensureSchema(db);
    const mine = createProject(db, { name: 'My team' });
    const other = createProject(db, { name: 'Other team' });
    upsertProjectMember(db, mine.id, 'alice', 'member');
    upsertProjectMember(db, other.id, 'bob', 'producer');
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('auth', { userId: 'alice', externalId: 'alice', isAdmin: true, role: 'admin', projectKey: null, displayName: null });
      await next();
    });
    registerTeamRoutes(app, { db } as unknown as CorpusContext);
    const response = await app.request('/teams/mine');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { teams: [{ id: mine.id, name: mine.name }] });
    assert.equal((await app.request(`/teams/${other.id}?userId=bob`)).status, 404);
    assert.equal((await app.request(`/teams/${mine.id}`)).status, 200);
    removeProjectMember(db, mine.id, 'alice');
    assert.equal((await app.request(`/teams/${mine.id}`)).status, 404);
    assert.equal((await app.request('/teams/unknown')).status, 404);
  } finally { db.close(); }
});
