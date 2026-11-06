/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';
import { residentOperationPolicy } from '../plugins/access/resident-operations.ts';

const identity: AuthIdentity = { userId: 'owner', externalId: 'mapped', role: 'general', displayName: 'Owner', projectKey: 'glab', isAdmin: false };
const prefix = '/api/x/cocoiru/resident/glab';
function context(method: string, path: string, body?: string): Context {
  return { req: { method, path, raw: new Request('https://glab.example' + path, { method, body }) } } as unknown as Context;
}
function fixture() {
  const state = { admitted: true, leaseUntil: 1100, recipient: 'recipient', callRecipient: 'owner', callExists: true, queriedRecipient: '' };
  configureAdmissionPolicy({ prepare: (sql: string) => ({ get: (id: string, value: unknown) => {
    if (sql.includes('glab_admission')) return { status: state.admitted ? 'approved' : 'rejected' };
    if (sql.includes('glab_cocoiru_availability')) { state.queriedRecipient = id; return id === state.recipient && state.leaseUntil > Number(value) ? { user_id: id } : undefined; }
    if (sql.includes('glab_cocoiru_call')) return state.callExists && id === 'call' && value === state.callRecipient ? { id } : undefined;
    throw new Error('Unexpected resource query');
  } }) } as unknown as SqlDb);
  return state;
}

test('four resident private reads and availability/broadcast writes recheck current admission', async () => {
  const state = fixture();
  for (const [method, path, action] of [
    ['GET', '/api/x/cocoiru/active-members', 'resident.active-members.read'], ['GET', prefix + '/available', 'resident.available.read'],
    ['GET', prefix + '/inbox', 'resident.inbox.read'], ['GET', prefix + '/discord-lobby', 'resident.lobby-secret.read'],
    ['PUT', prefix + '/availability', 'resident.availability.update'], ['POST', prefix + '/tasukete', 'resident.tasukete.create'],
  ]) {
    const c = context(method!, path!), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, method === 'GET' ? 'sensitive_read' : 'important');
    assert.equal(await operation.authorizeResource(c, identity), true);
    state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
    assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
    if (method !== 'GET') assert.equal(operation.maximumBodyBytes, 8192);
  }
});

test('calls recheck the current recipient lease without consuming or changing the raw request', async () => {
  const state = fixture(), raw = JSON.stringify({ recipientId: 'recipient', title: 'Hello', body: 'same bytes' });
  const c = context('POST', prefix + '/calls', raw), policy = residentOperationPolicy(() => 1000), operation = policy(c); assert.ok(operation);
  assert.equal(operation.maximumBodyBytes, 8192); assert.equal(await operation.authorizeResource(c, identity), true);
  assert.equal(state.queriedRecipient, 'recipient'); state.leaseUntil = 1000;
  assert.equal(await operation.authorizeResource(c, identity), false);
  assert.equal(c.req.raw.bodyUsed, false); assert.equal(await c.req.raw.text(), raw);
  for (const value of ['null', '{}', '{"recipientId":7}', '{"recipientId":"other"}', 'invalid']) {
    const invalid = context('POST', prefix + '/calls', value), classified = policy(invalid); assert.ok(classified);
    assert.equal(await classified.authorizeResource(invalid, identity), false);
  }
});

test('acknowledgment requires this verified subject to own the current call, with no admin bypass', async () => {
  const state = fixture(), c = context('DELETE', prefix + '/inbox/call'), operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(operation.action, 'resident.call.acknowledge'); assert.equal(await operation.authorizeResource(c, identity), true);
  state.callRecipient = 'other'; assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), false);
  state.callRecipient = 'owner'; state.callExists = false; assert.equal(await operation.authorizeResource(c, identity), false);
});

test('unknown groups, methods and paths are not resident capabilities', () => {
  fixture();
  for (const [method, path] of [['GET', '/resident/other/inbox'], ['POST', '/resident/glab/discord-lobby'], ['GET', '/resident/glab/private'],
    ['DELETE', '/resident/glab/inbox/%2F'], ['DELETE', '/resident/glab/inbox/%zz'], ['HEAD', '/active-members']]) {
    assert.equal(glabOperationPolicy(context(method!, '/api/x/cocoiru' + path)), null);
  }
});
