/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono, type AuthIdentity, type Context, type CorpusContext } from '../corpus/server/hub/sdk.ts';
import type { EventRow } from '../plugins/events/store.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { odeumOperationPolicy } from '../plugins/access/odeum-operations.ts';
import { OdeumAuthorization } from '../plugins/odeum/authorization.ts';
import { makeOdeumRoutes } from '../plugins/odeum/routes.ts';
import { getOdeumSession, startOdeumSession, startDirectSession, endOdeumSession } from '../plugins/odeum/session-store.ts';
import { openTempDb } from './sqlite-fixture.ts';

const identity: AuthIdentity = { userId: 'viewer', externalId: 'viewer', role: 'general', displayName: 'Viewer', projectKey: 'glab', isAdmin: false };
const context = (method: string, path: string, body?: unknown): Context => ({ req: { method, path,
  raw: new Request(`https://hub.example.test${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
} } as unknown as Context);

function fixture() {
  const temp = openTempDb('glab-odeum-auth-'), { db } = temp;
  for (const id of ['viewer', 'presenter', 'creator', 'outsider']) db.prepare('INSERT INTO glab_admission(user_id, status, requested_at) VALUES (?, ?, ?)').run(id, 'approved', 0);
  db.prepare('INSERT INTO glab_member_role(user_id, role, created_at) VALUES (?, ?, ?)').run('viewer', 'student', 0);
  const event: EventRow = { id: 1, title: 'Presentation', body: null, location: null, starts_at: 1000, ends_at: 2000,
    facility_id: null, reservation_id: null, created_by: 'creator', created_at: 0, notified_at: null, discord_message_id: null,
    audience_roles: '["student"]', recurrence: 'none' };
  const state = { exists: true, onRead: () => {} };
  const events = () => ({ get: async (_id: number) => { state.onRead(); return state.exists ? event : null; } });
  configureAdmissionPolicy(db);
  startOdeumSession(db, { eventId: 1, presenterUserId: 'presenter', id: 'event', now: 0 });
  startDirectSession(db, { title: 'Standalone', presenterUserId: 'presenter', id: 'direct', now: 1 });
  const policy = odeumOperationPolicy(events), authorization = new OdeumAuthorization(db, events);
  return { ...temp, event, events, state, policy, authorization };
}

test('exact classifications include sensitive GETs and never grant arbitrary presentation methods', async () => {
  const f = fixture();
  try {
    for (const [method, path, action, risk] of [
      ['GET', '/status', 'odeum.status.read', 'read'], ['GET', '/live', 'odeum.live.read', 'sensitive_read'],
      ['GET', '/ticket-pubkeys', 'odeum.ticket-keys.read', 'sensitive_read'],
      ['POST', '/sessions', 'odeum.session.start', 'important'], ['POST', '/sessions/event/end', 'odeum.session.end', 'important'],
      ['POST', '/sessions/event/viewer-ticket', 'odeum.viewer-ticket.issue', 'important'],
      ['GET', '/sessions/event/invitation', 'odeum.invitation.read', 'sensitive_read'],
      ['POST', '/sessions/event/program-ticket', 'odeum.program-ticket.issue', 'important'],
    ]) {
      const operation = f.policy(context(method!, '/api/x/odeum' + path));
      assert.ok(operation); assert.equal(operation.action, action); assert.equal(operation.risk, risk);
    }
    for (const [method, path] of [['HEAD', '/live'], ['GET', '/sessions'], ['GET', '/sessions/event/end'], ['POST', '/sessions/event/invitation'], ['POST', '/sessions/event/unknown']]) {
      assert.equal(f.policy(context(method!, '/api/x/odeum' + path)), null);
    }
    const c = context('GET', '/api/x/odeum/ticket-pubkeys'), operation = f.policy(c); assert.ok(operation);
    assert.equal(await operation.authorizeResource(c, identity), false);
    assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), true);
  } finally { f.close(); }
});

test('current audience permits viewing, while invitation and start require their actual operators', async () => {
  const f = fixture();
  try {
    const viewer = context('POST', '/api/x/odeum/sessions/event/viewer-ticket');
    const invitation = context('GET', '/api/x/odeum/sessions/event/invitation');
    const read = f.policy(viewer), secret = f.policy(invitation); assert.ok(read); assert.ok(secret);
    assert.equal(await read.authorizeResource(viewer, identity), true);
    assert.equal(await secret.authorizeResource(invitation, identity), false);
    assert.equal(await secret.authorizeResource(invitation, { ...identity, userId: 'presenter' }), true);
    f.db.prepare('DELETE FROM glab_member_role WHERE user_id = ?').run(identity.userId);
    assert.equal(await read.authorizeResource(viewer, identity), false);
    const start = context('POST', '/api/x/odeum/sessions', { eventId: 1 }), operation = f.policy(start); assert.ok(operation);
    assert.equal(await operation.authorizeResource(start, identity), false);
    assert.equal(await operation.authorizeResource(start, { ...identity, userId: 'creator' }), true);
    assert.equal(start.req.raw.bodyUsed, false);
    const direct = context('POST', '/api/x/odeum/sessions', { title: 'Live' }), standalone = f.policy(direct); assert.ok(standalone);
    assert.equal(await standalone.authorizeResource(direct, identity), true);
    assert.equal(await standalone.authorizeResource(direct, { ...identity, userId: '' }), false);
    const malformed = context('POST', '/api/x/odeum/sessions', { eventId: null, title: 'Live' });
    assert.equal(await f.policy(malformed)?.authorizeResource(malformed, identity), false);
  } finally { f.close(); }
});

test('revocation or session termination during the PostgreSQL read denies further ticket access', async () => {
  for (const mode of ['admission', 'roles', 'ended'] as const) {
    const f = fixture();
    try {
      f.state.onRead = () => {
        if (mode === 'admission') f.db.prepare('UPDATE glab_admission SET status = ? WHERE user_id = ?').run('rejected', identity.userId);
        if (mode === 'roles') f.db.prepare('DELETE FROM glab_member_role WHERE user_id = ?').run(identity.userId);
        if (mode === 'ended') endOdeumSession(f.db, 'event', 9);
      };
      const c = context('POST', '/api/x/odeum/sessions/event/viewer-ticket'), operation = f.policy(c); assert.ok(operation);
      assert.equal(await operation.authorizeResource(c, identity), false, mode);
    } finally { f.close(); }
  }
});

test('event removal preserves stopping one own presentation, and does not disclose invitations', async () => {
  const f = fixture();
  try {
    f.state.exists = false;
    const stop = context('POST', '/api/x/odeum/sessions/event/end'), end = f.policy(stop); assert.ok(end);
    assert.equal(await end.authorizeResource(stop, { ...identity, userId: 'presenter' }), true);
    assert.equal(await end.authorizeResource(stop, identity), false);
    const invite = context('GET', '/api/x/odeum/sessions/event/invitation'), operation = f.policy(invite); assert.ok(operation);
    assert.equal(await operation.authorizeResource(invite, { ...identity, userId: 'presenter' }), false);
    const direct = context('GET', '/api/x/odeum/sessions/direct/invitation'), standalone = f.policy(direct); assert.ok(standalone);
    assert.equal(await standalone.authorizeResource(direct, { ...identity, userId: 'presenter' }), false);
  } finally { f.close(); }
});

test('program tickets bind the current project and current participant; role changes cannot move a program', async () => {
  const f = fixture();
  try {
    f.db.prepare('INSERT INTO glab_project(id,name,created_at,updated_at) VALUES (?,?,?,?)').run('project', 'Project', 0, 0);
    f.db.prepare('INSERT INTO glab_project_member(project_id,user_id,role,created_at) VALUES (?,?,?,?)').run('project', identity.userId, 'member', 0);
    f.db.prepare('INSERT INTO glab_odeum_programs(session_id,project_id) VALUES (?,?)').run('event', 'project');
    const presenter = context('POST', '/api/x/odeum/sessions/event/program-ticket', { role: 'presenter', slot: 'input1' });
    const operation = f.policy(presenter); assert.ok(operation);
    assert.equal(await operation.authorizeResource(presenter, identity), true);
    f.db.prepare('DELETE FROM glab_project_member WHERE user_id = ?').run(identity.userId);
    assert.equal(await operation.authorizeResource(presenter, identity), false);
    const producer = context('POST', '/api/x/odeum/sessions/event/program-ticket', { role: 'producer', projectId: 'other' });
    assert.equal(await f.policy(producer)?.authorizeResource(producer, { ...identity, isAdmin: true }), false);
    assert.equal(presenter.req.raw.bodyUsed, false);
  } finally { f.close(); }
});

test('the real stop handler rechecks admission after its event read and does not end the row', async () => {
  const f = fixture();
  try {
    const actor = { ...identity, userId: 'presenter' };
    f.state.onRead = () => { f.db.prepare('UPDATE glab_admission SET status = ? WHERE user_id = ?').run('rejected', actor.userId); };
    const app = new Hono();
    app.use('*', async (c, next) => { c.set('auth', actor); await next(); });
    const ctx = { db: f.db, logger: { info: () => {} } } as unknown as CorpusContext;
    app.route('/api/x/odeum', makeOdeumRoutes(ctx, { signer: null, relay: null, invitationBases: null, disabledReason: 'ticket_key_missing' }, f.events));
    assert.equal((await app.request('/api/x/odeum/sessions/event/end', { method: 'POST' })).status, 404);
    assert.equal(getOdeumSession(f.db, 'event')?.status, 'live');
    f.state.onRead = () => {};
    f.db.prepare('UPDATE glab_admission SET status = ? WHERE user_id = ?').run('approved', actor.userId);
    assert.equal((await app.request('/api/x/odeum/sessions/event/end', { method: 'POST' })).status, 200);
    assert.equal(getOdeumSession(f.db, 'event')?.status, 'ended');
  } finally { f.close(); }
});
