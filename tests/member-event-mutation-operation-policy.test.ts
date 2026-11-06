/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { eventMutationOperationPolicy } from '../plugins/access/event-mutation-operations.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';
import type { EventRow } from '../plugins/events/store.ts';

const identity: AuthIdentity = { userId: 'subject', externalId: 'mapped', role: 'general', displayName: 'Subject', projectKey: 'glab', isAdmin: false };
const context = (method: string, path: string): Context => ({ req: { method, path: '/api/x/events' + path } } as unknown as Context);
function fixture() {
  const state = { admitted: true, owner: 'subject', exists: true, revokeDuringRead: false, reads: 0 };
  configureAdmissionPolicy({ prepare: () => ({ get: () => ({ status: state.admitted ? 'approved' : 'rejected' }) }) } as unknown as SqlDb);
  const policy = eventMutationOperationPolicy(() => ({ get: async id => {
    assert.equal(id, 7); state.reads++;
    if (state.revokeDuringRead) state.admitted = false;
    return state.exists ? { id, created_by: state.owner } as EventRow : null;
  } }));
  return { state, policy };
}

test('five exact event operations declare separate risk/body limits and require current admission', async () => {
  const { state, policy } = fixture();
  for (const [method, path, action, risk, limit] of [
    ['GET', '/facilities', 'events.facilities.read', 'read', 0],
    ['GET', '/meet/organizations', 'events.organizations.read', 'sensitive_read', 0],
    ['POST', '/events', 'events.create', 'important', 16384],
    ['POST', '/events/7/meet', 'events.meet.create', 'important', 8192],
    ['DELETE', '/events/7', 'events.delete', 'important', 0],
  ] as const) {
    const c = context(method, path), operation = policy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, risk); assert.equal(operation.maximumBodyBytes, limit);
    assert.equal(glabOperationPolicy(c)?.action, action);
    assert.equal(await operation.authorizeResource(c, identity), true);
    state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
    assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
  }
});

test('mutations recheck the actual current row owner after awaited reads, not just active membership', async () => {
  const { state, policy } = fixture();
  for (const [method, path] of [['POST', '/events/7/meet'], ['DELETE', '/events/7']]) {
    const c = context(method!, path!), operation = policy(c); assert.ok(operation);
    state.owner = 'other'; assert.equal(await operation.authorizeResource(c, identity), false);
    assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), true);
    state.exists = false; assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), false); state.exists = true;
    state.owner = identity.userId; state.revokeDuringRead = true;
    assert.equal(await operation.authorizeResource(c, identity), false);
    state.revokeDuringRead = false; state.admitted = true;
  }
  assert.ok(state.reads > 0);
});

test('malformed ids, unknown writes, attendance and HEAD cannot inherit these event grants', () => {
  const { policy } = fixture();
  for (const [method, path] of [['HEAD', '/facilities'], ['PATCH', '/events/7'], ['GET', '/events/7/meet'],
    ['DELETE', '/events/0'], ['DELETE', '/events/01'], ['DELETE', '/events/9007199254740992'],
    ['POST', '/events/7/attendance'], ['POST', '/events/7/meet/extra'], ['POST', '/events/7/force']]) {
    assert.equal(policy(context(method!, path!)), null);
  }
});
