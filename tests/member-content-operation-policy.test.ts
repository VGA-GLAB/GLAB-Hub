import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';

const identity: AuthIdentity = { userId: 'member', externalId: 'mapped', role: 'general', displayName: 'Member', projectKey: 'glab', isAdmin: false };
const context = (method: string, path: string, body: unknown = {}): Context => ({ req: { method, path, json: async () => body } } as unknown as Context);
function fixture() {
  const state = { admitted: true, link: true, owner: 'member', projectMember: true, roles: [] as string[],
    quest: { owner_id: 'member', revision: 1, status: 'draft' } };
  configureAdmissionPolicy({ prepare: (sql: string) => ({
    all: () => {
      if (sql.includes('glab_member_role')) return state.roles.map(role => ({ role }));
      throw new Error('Unexpected collection query');
    },
    get: () => {
      if (sql.includes('glab_admission')) return { status: state.admitted ? 'approved' : 'rejected' };
      if (sql.includes('glab_tech_link')) return state.link ? { posted_by: state.owner } : undefined;
      if (sql.includes('glab_job')) return { owner_user_id: state.owner };
      if (sql.includes('glab_quest')) return state.quest;
      if (sql.includes('glab_project_member')) return state.projectMember ? { yes: 1 } : undefined;
      throw new Error('Unexpected resource query');
    },
  }) } as unknown as SqlDb);
  return state;
}

test('subject/member data GETs are sensitive; current admission is required each time', async () => {
  const state = fixture();
  for (const path of ['/api/x/dashboard/summary', '/api/x/dashboard/permissions', '/api/x/dashboard/location',
    '/api/x/jobs', '/api/x/jobs/career', '/api/x/tech-links/links', '/api/x/tech-links/links/record/comments', '/api/x/quests/mine']) {
    const c = context('GET', path), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.risk, 'sensitive_read');
    assert.equal(await operation.authorizeResource(c, identity), true);
    state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
  }
  assert.equal(glabOperationPolicy(context('GET', '/api/x/tech-links/new-private-data')), null);
  assert.equal(glabOperationPolicy(context('PUT', '/api/x/dashboard/location')), null);
  assert.equal(glabOperationPolicy(context('POST', '/api/x/tech-links/external/links')), null);
});

test('link mutation checks the current existing row and current owner, not the original poster claim', async () => {
  const state = fixture(), c = context('PATCH', '/api/x/tech-links/links/record');
  const operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(operation.risk, 'important'); assert.equal(await operation.authorizeResource(c, identity), true);
  state.owner = 'other'; assert.equal(await operation.authorizeResource(c, identity), false);
  assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), true);
  state.link = false; assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), false);
  assert.equal(glabOperationPolicy(context('PATCH', '/api/x/tech-links/links/id%2Fother')), null);
});

test('jobs close keeps current ownership and migration stays administrator-only', async () => {
  const state = fixture(), c = context('POST', '/api/x/jobs/1/close');
  const operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(await operation.authorizeResource(c, identity), true);
  state.owner = 'other'; assert.equal(await operation.authorizeResource(c, identity), false);
  const migration = context('PUT', '/api/x/jobs/1/owner'), migrate = glabOperationPolicy(migration); assert.ok(migrate);
  assert.equal(await migrate.authorizeResource(migration, identity), false);
  assert.equal(await migrate.authorizeResource(migration, { ...identity, isAdmin: true }), true);
});

test('quest edits recheck owner, revision and the selected active project membership', async () => {
  const state = fixture(), c = context('PUT', '/api/x/quests/quest', { revision: 1, projectId: 'project' });
  const operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(await operation.authorizeResource(c, identity), true);
  state.projectMember = false; assert.equal(await operation.authorizeResource(c, identity), false); state.projectMember = true;
  state.quest.revision = 2; assert.equal(await operation.authorizeResource(c, identity), false); state.quest.revision = 1;
  state.quest.owner_id = 'other'; assert.equal(await operation.authorizeResource(c, identity), false);
  assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), false);
});

test('quest approval uses current GLAB approver roles and pending revision, including sensitive pending reads', async () => {
  const state = fixture(); state.quest.status = 'pending'; state.roles = ['lead'];
  const c = context('POST', '/api/x/quests/quest/decision', { revision: 1, approve: true });
  const operation = glabOperationPolicy(c); assert.ok(operation); assert.equal(operation.risk, 'important');
  assert.equal(await operation.authorizeResource(c, identity), true);
  const pending = context('GET', '/api/x/quests/pending'), read = glabOperationPolicy(pending); assert.ok(read);
  assert.equal(read.risk, 'sensitive_read'); assert.equal(await read.authorizeResource(pending, identity), true);
  state.roles = []; assert.equal(await operation.authorizeResource(c, identity), false);
  assert.equal(await read.authorizeResource(pending, { ...identity, isAdmin: true }), false);
  state.roles = ['instructor']; state.quest.status = 'withdrawn'; assert.equal(await operation.authorizeResource(c, identity), false);
});
