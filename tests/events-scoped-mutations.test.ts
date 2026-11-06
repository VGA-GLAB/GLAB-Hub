/** Actual Hono/shared-gate orchestration with borrowed bounded stores; no live PG or service startup.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { Hono, type AuthIdentity, type CorpusContext, type ServiceConnector } from '../corpus/server/hub/sdk.ts';
import { runServiceOperation, type ServiceOperationGate } from '../corpus/server/service-operation-gate.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { eventMutationOperationPolicy } from '../plugins/access/event-mutation-operations.ts';
import { localEventOperationPolicy } from '../plugins/access/local-event-operations.ts';
import { makeRoutes, type EventRouteStores } from '../plugins/events/index.ts';
import { AedilisEventClient } from '../plugins/events/aedilis-client.ts';
import { EventOwnerRejected, type EventRow, type EventMutationOwner } from '../plugins/events/store.ts';
import { boundTestSession, setBoundTestUser, testDelegationProvider } from './bound-user-fixture.ts';

const identity: AuthIdentity = { userId: 'subject', externalId: 'subject', role: 'general', displayName: null, projectKey: 'glab', isAdmin: false };
const draft = { title: 'Event', startsAt: 1000, endsAt: 2000, facilityId: 'room' };
const reservationId = '00000000-0000-4000-8000-000000000007';
function row(): EventRow { return { id: 7, title: 'Event', body: null, location: 'Room', starts_at: 1000, ends_at: 2000,
  facility_id: 'room', reservation_id: reservationId, created_by: 'subject', created_at: 0, notified_at: null,
  discord_message_id: null, audience_roles: '[]', recurrence: 'none', meeting_id: null, meet_url: null }; }

function fixture() {
  const db = new DatabaseSync(':memory:'), secret = randomBytes(48).toString('base64url');
  const state = { event: row() as EventRow | null, creates: 0, deletes: 0, meetWrites: 0, reserves: 0, cancels: 0, meets: 0,
    promoted: 0, admin: false, onGet: async () => {}, onCreate: async () => {}, onTarget: (_kind: string) => {}, organizationsFail: false };
  const revoke = (): void => { db.prepare("UPDATE glab_admission SET status='rejected' WHERE user_id=?").run(identity.userId); };
  const requireOwner = (owner: EventMutationOwner): void => {
    owner.assertCurrent(); if (!state.event) throw new EventOwnerRejected('not_found');
    if (state.event.created_by !== owner.userId && !owner.isAdmin) throw new EventOwnerRejected('forbidden');
  };
  const events: ReturnType<EventRouteStores['events']> = {
    get: async () => { await state.onGet(); return state.event ? { ...state.event } : null; },
    list: async () => state.event ? [{ ...state.event, occurrence_date: state.event.occurrence_date ?? null }] : [],
    create: async (input, assertCurrent) => {
      state.creates++; assertCurrent(); await state.onCreate(); assertCurrent();
      state.event = { ...row(), created_by: input.createdBy, reservation_id: input.reservationId ?? null }; return 7;
    },
    setMeetUrl: async (_id, url, owner) => { requireOwner(owner); state.meetWrites++; if (state.event) state.event.meet_url = url; },
    delete: async (_id, owner) => { requireOwner(owner); state.deletes++; state.event = null; return true; },
  };
  const facility = { id: 'room', displayName: 'Room', aedilisFacilityId: 'ae-room' };
  const facilities: ReturnType<EventRouteStores['facilities']> = { get: async () => facility, list: async () => [facility],
    promote: async candidate => { state.promoted++; return candidate; } };
  const provider = testDelegationProvider();
  const connector: ServiceConnector = { id: 'aedilis', title: 'Aedilis', baseUrl: 'https://ae.fixture.invalid', scope: 'multi', health: async () => ({ status: 'up' }),
    fetch: async (path, init) => {
      assert.ok(init?.signal instanceof AbortSignal); assert.equal(new Headers(init.headers).get('cookie'), null);
      assert.equal(new Headers(init.headers).get('authorization'), 'Cernere-Delegation ' + 'd'.repeat(43));
      if (path === '/api/integrations/glab/reservations/capabilities') return Response.json({ groupContextVersion: 1 });
      if (path === '/api/integrations/glab/facilities') return Response.json({ items: [{ id: 'ae-room', name: 'Room', location: null }] });
      if (path === '/api/integrations/glab/reservations' && init.method === 'POST') {
        state.reserves++; state.onTarget('reserve'); return Response.json({ reservation: { id: reservationId } });
      }
      if (path === '/api/integrations/glab/reservations/' + reservationId && init.method === 'DELETE') {
        state.cancels++; state.onTarget('cancel'); return Response.json({ ok: true });
      }
      if (path === '/api/integrations/glab/meet/external/glab-event/7') {
        state.meets++; state.onTarget('meet'); return Response.json({ status: 'ready', url: 'https://meet.google.com/abc-defg-hij' });
      }
      throw new Error('Unexpected delegated path');
    } };
  const ctx = { db, env: (name: string) => name === 'GLAB_AEDILIS_CONTEXT_SECRET' ? secret : undefined, tokenProvider: provider,
    identityProvider: { organizations: async () => { if (state.organizationsFail) throw new Error('private lookup diagnostic'); return []; } }, logger: { info() {}, error() {} },
  } as unknown as CorpusContext;
  try {
    const routes = makeRoutes(ctx, new AedilisEventClient(connector, provider), connector, { events: () => events, facilities: () => facilities });
    configureAdmissionPolicy(db as unknown as SqlDb);
    db.prepare('INSERT INTO glab_admission(user_id,status,requested_at) VALUES(?,?,?)').run(identity.userId, 'approved', 0);
    const mutations = eventMutationOperationPolicy(() => events), local = localEventOperationPolicy(() => events);
    const gate: ServiceOperationGate = { policy: c => mutations(c) ?? local(c),
      sessions: { run: async (_token, _operation, callbacks) => {
        if (!await callbacks.authorizeResource({ requestId: 'fixture', risk: callbacks.risk })) throw new Error('Denied');
        return callbacks.execute();
      } }, delegations: { run: async () => { throw new Error('Unexpected incoming delegation'); } }, identity: () => identity, isCurrent: () => true };
    const app = new Hono(); app.use('*', async (c, next) => {
      const current = { ...identity, isAdmin: state.admin }; setBoundTestUser(c, current);
      return runServiceOperation(c, next, gate, { session: boundTestSession(current), identity: current });
    }); app.route('/api/x/events', routes);
    const request = (path: string, method = 'GET', body?: unknown) => app.request('/api/x/events' + path,
      { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { db, state, revoke, request };
  } catch (error) { db.close(); throw error; }
}

test('existing event creation/Meet/deletion uses current source owner and only scoped targets', async () => {
  const f = fixture();
  try {
    assert.equal((await f.request('/facilities')).status, 200);
    assert.equal((await f.request('/meet/organizations')).status, 200);
    assert.equal((await f.request('/events', 'POST', draft)).status, 200);
    assert.equal(f.state.creates, 1); assert.equal(f.state.reserves, 1);
    assert.equal((await f.request('/events/7/meet', 'POST', {})).status, 200);
    assert.equal(f.state.meets, 1); assert.equal(f.state.meetWrites, 1);
    assert.equal((await f.request('/events/7', 'DELETE')).status, 200);
    assert.equal(f.state.cancels, 1); assert.equal(f.state.deletes, 1);
  } finally { f.db.close(); }
});

test('a private other-owner event cannot issue a Google Meet or cancel/delete, and lookup uncertainty is explicit', async () => {
  const f = fixture();
  try {
    assert.ok(f.state.event); f.state.event.created_by = 'other';
    for (const [method, path] of [['POST', '/events/7/meet'], ['DELETE', '/events/7']]) assert.equal((await f.request(path!, method!, method === 'POST' ? {} : undefined)).status, 403);
    assert.equal(f.state.meets, 0); assert.equal(f.state.cancels, 0); assert.equal(f.state.deletes, 0);
    f.state.organizationsFail = true;
    const response = await f.request('/meet/organizations'); assert.equal(response.status, 503);
    const body = await response.text(); assert.equal(body.includes('private lookup'), false); assert.equal(body.includes('"items":[]'), false);
  } finally { f.db.close(); }
});

test('revocation after reservation/Meet replies prevents local writes and cannot announce successful data', async () => {
  for (const operation of ['reserve', 'meet']) {
    const f = fixture();
    try {
      f.state.onTarget = kind => { if (kind === operation) f.revoke(); };
      const response = operation === 'reserve' ? await f.request('/events', 'POST', draft) : await f.request('/events/7/meet', 'POST', {});
      assert.equal(response.status, 403); assert.equal(f.state.creates, 0); assert.equal(f.state.meetWrites, 0);
      assert.equal(f.state.deletes, 0); assert.equal(f.state.cancels, 0);
      assert.deepEqual(await response.json(), { error: 'current_booking_actor_unconfirmed', retryable: false });
    } finally { f.db.close(); }
  }
});

test('unknown PostgreSQL create result cannot trigger automatic cancellation or retry', async () => {
  const f = fixture();
  try {
    f.state.onCreate = async () => { throw new Error('private commit diagnostic'); };
    const response = await f.request('/events', 'POST', draft);
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'event_creation_result_unconfirmed', retryable: false });
    assert.equal(f.state.reserves, 1); assert.equal(f.state.creates, 1); assert.equal(f.state.cancels, 0); assert.equal(f.state.deletes, 0);
  } finally { f.db.close(); }
});

test('a row owner changed after remote cancellation cannot be deleted locally', async () => {
  const f = fixture();
  try {
    f.state.onTarget = kind => { if (kind === 'cancel' && f.state.event) f.state.event.created_by = 'other'; };
    const response = await f.request('/events/7', 'DELETE');
    assert.equal(response.status, 403); assert.equal(f.state.cancels, 1); assert.equal(f.state.deletes, 0);
  } finally { f.db.close(); }
});
