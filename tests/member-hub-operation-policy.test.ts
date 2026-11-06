/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';

const identity: AuthIdentity = { userId: 'member', externalId: 'mapped', role: 'general', displayName: 'Member', projectKey: 'glab', isAdmin: false };
const admin = { ...identity, isAdmin: true, role: 'admin' };
const context = (method: string, path: string): Context => ({ req: { method, path } } as unknown as Context);
function fixture() {
  const state = { admitted: true, subject: '' };
  configureAdmissionPolicy({ prepare: (sql: string) => ({ get: (subject: string) => {
    if (!sql.includes('glab_admission')) throw new Error('Unexpected resource query');
    state.subject = subject; return { status: state.admitted ? 'approved' : 'rejected' };
  } }) } as unknown as SqlDb);
  return state;
}

test('overview is sensitive while declared capability metadata is a subject-bound read', async () => {
  const state = fixture();
  for (const [path, action, risk] of [['/api/hub/overview', 'hub.overview.read', 'sensitive_read'],
    ['/api/capabilities', 'hub.capabilities.read', 'read'], ['/api/capabilities/', 'hub.capabilities.read', 'read']]) {
    const c = context('GET', path!), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, risk);
    assert.equal(await operation.authorizeResource(c, identity), true); assert.equal(state.subject, identity.userId);
    state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
    assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
  }
});

test('private identity mapping and discovery metadata require the verified admin, even for GET', async () => {
  fixture();
  for (const [path, action] of [['/api/hub/external-ids', 'hub.external-ids.read'], ['/api/hub/discovery', 'hub.discovery.read']]) {
    const c = context('GET', path!), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, 'sensitive_read');
    assert.equal(await operation.authorizeResource(c, identity), false);
    assert.equal(await operation.authorizeResource(c, { ...identity, role: 'admin' }), false);
    assert.equal(await operation.authorizeResource(c, admin), true);
    assert.equal(await operation.authorizeResource(c, { ...admin, isAdmin: false }), false);
  }
});

test('mapping reassignment and discovery changes are distinct important admin operations', async () => {
  fixture();
  for (const [method, path, action] of [['POST', '/api/hub/external-ids/reassign', 'hub.external-ids.reassign'],
    ['PUT', '/api/hub/discovery', 'hub.discovery.update']]) {
    const c = context(method!, path!), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, 'important');
    assert.equal(operation.maximumBodyBytes, 65536);
    assert.equal(await operation.authorizeResource(c, identity), false);
    assert.equal(await operation.authorizeResource(c, admin), true);
    assert.equal(await operation.authorizeResource(c, { ...admin, userId: '' }), false);
  }
});

test('generic data, capability invocation, MCP and unknown methods receive no broad metadata grant', () => {
  fixture();
  for (const [method, path] of [['POST', '/api/capabilities/module/action/invoke'], ['POST', '/mcp'], ['POST', '/mcp/'],
    ['GET', '/api/hub/data/voluptas/survey-catalog'], ['PUT', '/api/hub/data/other/arbitrary'],
    ['DELETE', '/api/hub/discovery'], ['GET', '/api/hub/external-ids/reassign'], ['HEAD', '/api/hub/overview'], ['GET', '/api/hub/private']]) {
    assert.equal(glabOperationPolicy(context(method!, path!)), null);
  }
});
