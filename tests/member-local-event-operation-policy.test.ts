/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import type { EventRow } from '../plugins/events/store.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';
import { localEventOperationPolicy } from '../plugins/access/local-event-operations.ts';

const identity: AuthIdentity = { userId: 'viewer', externalId: 'mapped', role: 'general', displayName: 'Viewer', projectKey: 'glab', isAdmin: false };
const context = (method: string, path: string): Context => ({ req: { method, path } } as unknown as Context);
function fixture() {
  const state = { admitted: true, roles: ['student'], exists: true, revokeDuringRead: false, requestedId: 0 };
  const event: EventRow = { id: 1, title: 'Meeting', body: null, location: null, starts_at: 1000, ends_at: 2000,
    facility_id: null, reservation_id: null, created_by: 'organizer', created_at: 0, notified_at: null, discord_message_id: null,
    audience_roles: '["student"]', recurrence: 'none', meeting_id: 'meeting' };
  configureAdmissionPolicy({ prepare: (sql: string) => ({
    get: () => { if (sql.includes('glab_admission')) return { status: state.admitted ? 'approved' : 'rejected' }; throw new Error('Unexpected row query'); },
    all: () => { if (sql.includes('glab_member_role')) return state.roles.map(role => ({ role })); throw new Error('Unexpected role query'); },
  }) } as unknown as SqlDb);
  const policy = localEventOperationPolicy(() => ({ get: async (id: number) => {
    state.requestedId = id; if (state.revokeDuringRead) state.admitted = false; return state.exists ? event : null;
  } }), () => 2000);
  return { state, event, policy };
}

test('event list is sensitive and current admission remains necessary before endpoint row projection', async () => {
  const { state } = fixture(), c = context('GET', '/api/x/events/events'), operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(operation.action, 'events.list'); assert.equal(operation.risk, 'sensitive_read');
  assert.equal(await operation.authorizeResource(c, identity), true);
  state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false);
  assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
});

test('attendance access rechecks actual row, current audience and roles, and poll occurrence eligibility', async () => {
  const { state, event, policy } = fixture();
  for (const method of ['GET', 'PUT']) {
    const c = context(method, '/api/x/events/events/1/attendance'), operation = policy(c); assert.ok(operation);
    assert.equal(operation.action, method === 'GET' ? 'events.attendance.read' : 'events.absence.update');
    assert.equal(operation.risk, method === 'GET' ? 'sensitive_read' : 'important');
    assert.equal(glabOperationPolicy(c)?.action, operation.action);
    assert.equal(await operation.authorizeResource(c, identity), true); assert.equal(state.requestedId, 1);
    state.roles = []; assert.equal(await operation.authorizeResource(c, identity), false);
    event.created_by = identity.userId; assert.equal(await operation.authorizeResource(c, identity), true);
    event.created_by = 'organizer'; state.roles = ['student'];
    event.meeting_id = null; assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), false); event.meeting_id = 'meeting';
    event.recurrence = 'weekly'; assert.equal(await operation.authorizeResource(c, identity), false); event.recurrence = 'none';
    state.exists = false; assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), false); state.exists = true;
  }
});

test('past attendance can be read but even administrators cannot alter absence after the event ends', async () => {
  const { event, policy } = fixture(); event.ends_at = 1999;
  const read = context('GET', '/api/x/events/events/1/attendance'), write = context('PUT', '/api/x/events/events/1/attendance');
  const readOperation = policy(read), writeOperation = policy(write); assert.ok(readOperation); assert.ok(writeOperation);
  assert.equal(await readOperation.authorizeResource(read, identity), true);
  assert.equal(await writeOperation.authorizeResource(write, { ...identity, isAdmin: true }), false);
  event.ends_at = null; assert.equal(await writeOperation.authorizeResource(write, identity), false);
});

test('admission revoked while reading the PostgreSQL event cannot use a stale pre-read decision', async () => {
  const { state, policy } = fixture(), c = context('PUT', '/api/x/events/events/1/attendance'), operation = policy(c); assert.ok(operation);
  state.revokeDuringRead = true; assert.equal(await operation.authorizeResource(c, identity), false);
});

test('external reservation/Meet mutations and malformed event ids do not inherit a local event grant', () => {
  fixture();
  for (const [method, path] of [['POST', '/events'], ['DELETE', '/events/1'], ['POST', '/events/1/meet'],
    ['GET', '/facilities'], ['GET', '/meet/organizations'], ['POST', '/events/1/attendance'],
    ['PUT', '/events/9007199254740992/attendance'], ['GET', '/events/0/attendance'], ['HEAD', '/events']]) {
    assert.equal(glabOperationPolicy(context(method!, '/api/x/events' + path)), null);
  }
});
