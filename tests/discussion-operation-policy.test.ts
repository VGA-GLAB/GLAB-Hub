import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';

const identity: AuthIdentity = { userId: 'viewer', externalId: 'mapped', role: 'general', displayName: 'Viewer', projectKey: 'glab', isAdmin: false };
const context = (method: string, path: string): Context => ({ req: { method, path } } as unknown as Context);
function fixture() {
  const state = { admitted: true, exists: true, roles: ['lead'], owner: 'owner', audience: '["lead"]' };
  configureAdmissionPolicy({ prepare: (sql: string) => ({
    get: () => {
      if (sql.includes('glab_admission')) return { status: state.admitted ? 'approved' : 'rejected' };
      if (sql.includes('glab_forum_thread')) return state.exists ? { created_by: state.owner, audience_roles: state.audience } : undefined;
      if (sql.includes('glab_consult')) return state.exists ? { created_by: state.owner } : undefined;
      throw new Error('Unexpected resource query');
    },
    all: () => { if (sql.includes('glab_member_role')) return state.roles.map(role => ({ role })); throw new Error('Unexpected role query'); },
  }) } as unknown as SqlDb);
  return state;
}

test('forum detail/comments recheck current audience and roles after admission', async () => {
  const state = fixture();
  for (const [method, suffix] of [['GET', ''], ['GET', '/comments'], ['POST', '/comments']] as const) {
    const c = context(method, '/api/x/forum/threads/thread' + suffix), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.risk, method === 'GET' ? 'sensitive_read' : 'important');
    assert.equal(await operation.authorizeResource(c, identity), true);
    state.roles = []; assert.equal(await operation.authorizeResource(c, identity), false);
    state.owner = identity.userId; assert.equal(await operation.authorizeResource(c, identity), true);
    state.owner = 'owner'; state.roles = ['lead']; state.admitted = false;
    assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
    state.exists = false; assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), false); state.exists = true;
  }
});

test('deleting a thread requires its current author/admin; pinning remains admin-only', async () => {
  const state = fixture(), c = context('DELETE', '/api/x/forum/threads/thread'), operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(await operation.authorizeResource(c, identity), false);
  state.owner = identity.userId; assert.equal(await operation.authorizeResource(c, identity), true);
  const pin = context('POST', '/api/x/forum/threads/thread/pin'), pinOperation = glabOperationPolicy(pin); assert.ok(pinOperation);
  assert.equal(await pinOperation.authorizeResource(pin, identity), false);
  assert.equal(await pinOperation.authorizeResource(pin, { ...identity, isAdmin: true }), true);
});

test('consult reads require an existing record; resolution keeps author/admin ownership', async () => {
  const state = fixture(), read = context('GET', '/api/x/consult/consults/consult'), resolve = context('POST', '/api/x/consult/consults/consult/resolve');
  const readOperation = glabOperationPolicy(read), resolveOperation = glabOperationPolicy(resolve); assert.ok(readOperation); assert.ok(resolveOperation);
  assert.equal(readOperation.risk, 'sensitive_read'); assert.equal(resolveOperation.risk, 'important');
  assert.equal(await readOperation.authorizeResource(read, identity), true);
  assert.equal(await resolveOperation.authorizeResource(resolve, identity), false);
  state.owner = identity.userId; assert.equal(await resolveOperation.authorizeResource(resolve, identity), true);
  state.exists = false; assert.equal(await readOperation.authorizeResource(read, identity), false);
  assert.equal(await resolveOperation.authorizeResource(resolve, { ...identity, isAdmin: true }), false);
});

test('presence roster is admin-only; self operations remain subject-bound', async () => {
  const state = fixture(), roster = context('GET', '/api/x/consult/available-members'), rosterOperation = glabOperationPolicy(roster); assert.ok(rosterOperation);
  assert.equal(rosterOperation.risk, 'sensitive_read');
  assert.equal(await rosterOperation.authorizeResource(roster, identity), false);
  assert.equal(await rosterOperation.authorizeResource(roster, { ...identity, isAdmin: true }), true);
  for (const [method, path] of [['GET', '/api/x/consult/availability'], ['PUT', '/api/x/consult/availability'], ['PUT', '/api/x/dashboard/location']] as const) {
    const c = context(method, path), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(await operation.authorizeResource(c, identity), true);
    assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
    state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
  }
  assert.equal(glabOperationPolicy(context('GET', '/api/x/forum/new-private-data')), null);
  assert.equal(glabOperationPolicy(context('POST', '/api/x/consult/external/presence')), null);
  assert.equal(glabOperationPolicy(context('DELETE', '/api/x/consult/availability')), null);
});
