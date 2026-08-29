import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Hono } from '../corpus/server/hub/sdk.ts';
import type { AuthIdentity, CorpusContext } from '../corpus/server/hub/sdk.ts';
import membersModule from '../plugins/members/index.ts';
import { createMember, ensureGlabUser } from '../plugins/data.ts';
import { openTempDb, type TempDb } from './sqlite-fixture.ts';

const identity = (isAdmin: boolean): AuthIdentity => ({
  userId: isAdmin ? 'admin-1' : 'member-1',
  externalId: isAdmin ? 'admin-1' : 'member-1',
  role: 'student',
  displayName: null,
  projectKey: null,
  isAdmin,
});

describe('members API contract', () => {
  let temp!: TempDb;
  let routes!: Hono;

  before(async () => {
    temp = openTempDb('glab-members-');
    const ctx = {
      db: temp.db,
      moduleId: 'members',
      registerConnector() {},
      registerRoute(sub: Hono) { routes = sub; },
      registerPanel() {},
      registerData() {},
      env() { return undefined; },
      logger: { info() {}, warn() {}, error() {} },
      tokenProvider: {},
    } as unknown as CorpusContext;
    await membersModule.setup(ctx);
  });

  after(() => { temp?.close(); });

  function app(isAdmin: boolean): Hono {
    const wrapper = new Hono();
    wrapper.use('*', async (c, next) => {
      c.set('auth', identity(isAdmin));
      await next();
    });
    wrapper.route('/', routes);
    return wrapper;
  }

  it('rejects roster reads by non-admin users', async () => {
    const response = await app(false).request('/list');
    assert.equal(response.status, 403);
  });

  it('creates and lists a member only through the admin API', async () => {
    const admin = app(true);
    const created = await admin.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Temporary Name', discordHandle: 'sample_user' }),
    });
    assert.equal(created.status, 201);

    const listed = await admin.request('/list');
    assert.equal(listed.status, 200);
    const body = await listed.json() as { members: Array<{ name: string }> };
    assert.deepEqual(body.members.map((member) => member.name), ['Temporary Name']);
  });

  it('links only a known GLAB user and removes the temporary name', async () => {
    const admin = app(true);
    const memberId = createMember(temp.db, { displayName: 'Link Target' }, 'admin-1').id;

    const unknown = await admin.request(`/${encodeURIComponent(memberId)}/link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'unknown-user' }),
    });
    assert.equal(unknown.status, 409);

    ensureGlabUser(temp.db, 'cernere-user-1');
    const linked = await admin.request(`/${encodeURIComponent(memberId)}/link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: 'cernere-user-1' }),
    });
    assert.equal(linked.status, 200);
    const body = await linked.json() as { member: { registered: boolean; name: string } };
    assert.equal(body.member.registered, true);
    assert.equal(body.member.name, '(Cernere 未接続)');
  });
});
