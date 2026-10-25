import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Hono, type CorpusContext } from '../corpus/server/hub/sdk.ts';
import { GLAB_SCHEMA, type SqlDb } from '../plugins/data.ts';
import { registerShowcaseRoutes } from '../plugins/projects/showcase-routes.ts';

it('requires user authentication for binaries and membership for profile publication', async () => {
  const database = new DatabaseSync(':memory:');
  const db = database as unknown as SqlDb;
  try {
    db.exec(GLAB_SCHEMA);
    db.prepare(`INSERT INTO glab_project (id,name,status,created_at,updated_at) VALUES ('p','Game','active',1,1)`).run();
    db.prepare(`INSERT INTO glab_work_showcase (project_id,published) VALUES ('p',1)`).run();
    db.prepare(`INSERT INTO glab_work_binary (project_id,name,content) VALUES ('p','Game.exe',?)`).run(new Uint8Array([1,2,3]));
    let loggedIn = false;
    const app = new Hono();
    app.use('*', async (c, next) => {
      if (loggedIn) {
        c.set('userToken', 'verified-session-token');
        c.set('auth', { userId: 'student', externalId: 'student', role: 'general', displayName: null, isAdmin: false, projectKey: 'glab' });
      }
      await next();
    });
    registerShowcaseRoutes(app, { db, logger: { error: () => {} } } as unknown as CorpusContext);
    for (const path of ['/showcase/works', '/showcase/download/p', '/showcase/mine']) {
      assert.equal((await app.request(path)).status, 401);
    }
    loggedIn = true;
    const download = await app.request('/showcase/download/p');
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('cache-control'), 'private, no-store');
    assert.match(download.headers.get('content-disposition') ?? '', /^attachment;/);
    assert.deepEqual([...new Uint8Array(await download.arrayBuffer())], [1,2,3]);
    assert.equal((await app.request('/showcase/executable/p?name=Game.exe', { method: 'PUT', body: 'bad' })).status, 403);
    const feature = () => app.request('/showcase/mine/p', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{"featured":true}' });
    assert.equal((await feature()).status, 403);
    db.prepare(`INSERT INTO glab_project_member (project_id,user_id,role,created_at) VALUES ('p','student','member',1)`).run();
    assert.equal((await feature()).status, 200);
    db.prepare('UPDATE glab_work_showcase SET published=0').run();
    assert.equal((await app.request('/showcase/download/p')).status, 404);
  } finally { database.close(); }
});
