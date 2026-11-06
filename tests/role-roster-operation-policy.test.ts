/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';

const identity: AuthIdentity = { userId: 'viewer', externalId: 'mapped', role: 'general', displayName: 'Viewer', projectKey: 'glab', isAdmin: false };
const admin: AuthIdentity = { ...identity, isAdmin: true, role: 'admin' };
const context = (method: string, path: string): Context => ({ req: { method, path } } as unknown as Context);
function fixture() {
  const state = { admitted: true, exists: true, lastId: '' };
  configureAdmissionPolicy({ prepare: (sql: string) => ({ get: (id: string) => {
    if (sql.includes('glab_admission')) return { status: state.admitted ? 'approved' : 'rejected' };
    if (sql.includes('FROM glab_member WHERE id')) { state.lastId = id; return state.exists ? { id } : undefined; }
    throw new Error('Unexpected resource query');
  } }) } as unknown as SqlDb);
  return state;
}

test('role reads retain admitted-member visibility, classify the roster as sensitive, and recheck admission', async () => {
  const state = fixture();
  for (const [path, action, risk] of [
    ['me', 'roles.self.read', 'sensitive_read'], ['defs', 'roles.definitions.read', 'read'], ['members', 'roles.members.read', 'sensitive_read'],
  ] as const) {
    const c = context('GET', '/api/x/roles/' + path), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, risk);
    assert.equal(await operation.authorizeResource(c, identity), true);
    state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
  }
});

test('role definition/assignment changes require the verified administrator for every exact operation', async () => {
  fixture();
  for (const [method, path, action] of [
    ['POST', 'defs', 'roles.definition.save'], ['DELETE', 'defs/lead', 'roles.definition.delete'],
    ['POST', 'members', 'roles.member.assign'], ['DELETE', 'members/subject/lead', 'roles.member.remove'],
  ] as const) {
    const c = context(method, '/api/x/roles/' + path), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, 'important');
    assert.equal(await operation.authorizeResource(c, identity), false);
    assert.equal(await operation.authorizeResource(c, { ...identity, role: 'admin' }), false);
    assert.equal(await operation.authorizeResource(c, admin), true);
    assert.equal(await operation.authorizeResource(c, { ...admin, isAdmin: false }), false);
  }
});

test('private roster enumeration/create remain admin-only; row mutations re-read the exact current row', async () => {
  const state = fixture();
  for (const [method, path, action] of [
    ['GET', 'list', 'roster.list'], ['GET', 'link-candidates', 'roster.link-candidates.read'], ['POST', '', 'roster.create'],
    ['PATCH', 'record%20id', 'roster.update'], ['DELETE', 'record%20id', 'roster.delete'], ['POST', 'record%20id/link', 'roster.link'],
  ] as const) {
    const c = context(method, '/api/x/members/' + path), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, method === 'GET' ? 'sensitive_read' : 'important');
    assert.equal(await operation.authorizeResource(c, identity), false);
    assert.equal(await operation.authorizeResource(c, admin), true);
    if (path.startsWith('record')) {
      assert.equal(state.lastId, 'record id'); state.exists = false;
      assert.equal(await operation.authorizeResource(c, admin), false); state.exists = true;
    }
    assert.equal(await operation.authorizeResource(c, { ...admin, userId: '' }), false);
  }
});

test('unknown role/roster paths and methods are refused rather than covered by a prefix', () => {
  fixture();
  for (const [method, path] of [
    ['PUT', '/roles/defs'], ['HEAD', '/roles/members'], ['GET', '/roles/private'], ['GET', '/members/record'],
    ['PUT', '/members/record/link'], ['PATCH', '/members/%2F'], ['DELETE', '/members/%zz'], ['GET', '/members/private/export'],
  ]) assert.equal(glabOperationPolicy(context(method!, '/api/x' + path)), null);
});
