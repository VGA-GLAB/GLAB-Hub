/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { Hono, type Context, type CorpusContext, type ServiceConnector } from '../corpus/server/hub/sdk.ts';
import { ensureSchema, type SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { finalizeMeetingEvent, cancelMeetingEvent, type MeetingImportStores } from '../plugins/facility/meeting-event.ts';
import { AEDILIS_MEETING_PREFIX, AEDILIS_GLAB_PREFIX } from '../plugins/downstream-operations.ts';
import { setBoundTestUser, testDelegationProvider } from './bound-user-fixture.ts';

const meetingId = '00000000-0000-4000-8000-000000000001';
function fixture() {
  const db = new DatabaseSync(':memory:');
  try {
    ensureSchema(db as unknown as SqlDb); configureAdmissionPolicy(db as unknown as SqlDb);
    db.prepare('INSERT INTO glab_admission(user_id,status,requested_at) VALUES (?,?,?)').run('subject', 'approved', 0);
    const state = { imports: 0, gets: 0, promotions: 0, failImport: false, withFacility: false,
      current: null as Context | null, onFinalize: () => {}, onFacilities: () => {}, paths: [] as string[] };
    const revoke = (): void => { db.prepare('UPDATE glab_admission SET status=? WHERE user_id=?').run('rejected', 'subject'); };
    const secret = randomBytes(48).toString('base64url');
    const ctx = { db, env: () => secret, tokenProvider: testDelegationProvider(), identityProvider: { organizations: async () => [] }, logger: { error() {} } } as unknown as CorpusContext;
    const connector: ServiceConnector = { id: 'aedilis', title: 'Aedilis', scope: 'multi', baseUrl: 'https://aedilis.fixture.invalid', health: async () => ({ status: 'up' }),
      fetch: async path => {
        state.paths.push(path);
        if (path === AEDILIS_GLAB_PREFIX + '/reservations/capabilities') return Response.json({ groupContextVersion: 1 });
        if (path.endsWith('/glab-event/cancel')) return Response.json({ ok: true });
        assert.equal(path, AEDILIS_MEETING_PREFIX + '/' + meetingId + '/glab-event/finalize');
        state.onFinalize();
        return Response.json({ meetingId, title: 'Imported poll', description: '', createdBy: 'subject',
          facilityId: state.withFacility ? 'room' : null, reservationId: state.withFacility ? 'reservation' : null,
          slot: { id: 'slot', venue: 'Room', startAt: '2028-01-01T10:00:00Z', endAt: '2028-01-01T11:00:00Z' } });
      } };
    const stores: MeetingImportStores = {
      facilities: () => ({ list: async () => { state.onFacilities(); return []; }, promote: async value => { state.promotions++; return value; } }),
      events: () => ({ importMeeting: async (id, input) => {
        state.imports++; assert.equal(id, meetingId); assert.equal(input.createdBy, 'subject');
        if (state.failImport) throw new Error('private database diagnostic');
        return 1;
      }, get: async () => { state.gets++; return { id: 1, title: 'Imported poll', body: '', location: 'Room', starts_at: Date.parse('2028-01-01T10:00:00Z'),
        ends_at: Date.parse('2028-01-01T11:00:00Z'), facility_id: null, reservation_id: null, created_by: 'subject', created_at: 0,
        notified_at: null, discord_message_id: null, audience_roles: null, recurrence: 'none', meeting_id: meetingId }; } }),
    };
    const app = new Hono(); app.use('*', async (c, next) => { setBoundTestUser(c, { userId: 'subject' }); state.current = c; await next(); });
    app.post('/meetings/:id/glab-event', c => finalizeMeetingEvent(c, ctx, connector, stores));
    app.post('/cancel', c => cancelMeetingEvent(c, ctx, connector, meetingId));
    const request = (signal?: AbortSignal): Promise<Response> => Promise.resolve(app.request('/meetings/' + meetingId + '/glab-event', { method: 'POST',
      body: JSON.stringify({ slotId: 'slot', revision: 1 }), headers: { 'content-type': 'application/json' }, signal }));
    return { db, app, state, revoke, request, close: () => db.close() };
  } catch (error) { db.close(); throw error; }
}

test('a valid handoff imports only the verified owner snapshot using the new exact target path', async () => {
  const f = fixture();
  try {
    const response = await f.request(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, eventId: 1 });
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(f.state.imports, 1); assert.equal(f.state.gets, 1); assert.equal(f.state.paths.length, 2);
    const cancelled = await f.app.request('/cancel', { method: 'POST' }); assert.equal(cancelled.status, 200);
    assert.equal(f.state.paths.at(-1), AEDILIS_MEETING_PREFIX + '/' + meetingId + '/glab-event/cancel');
  } finally { f.close(); }
});

for (const mode of ['admission', 'actor', 'disconnect'] as const) test(`authority changes after Ae finalization cannot enter the GLAB event store (${mode})`, async () => {
  const f = fixture(), controller = new AbortController();
  try {
    f.state.onFinalize = () => {
      if (mode === 'admission') f.revoke();
      if (mode === 'disconnect') controller.abort();
      if (mode === 'actor' && f.state.current) setBoundTestUser(f.state.current, { userId: 'another-subject' });
    };
    const response = await f.request(controller.signal); assert.equal(response.status, 403);
    assert.equal(f.state.imports, 0); assert.equal(f.state.promotions, 0); assert.equal(f.state.gets, 0);
    assert.equal(f.state.paths.length, 2);
    assert.deepEqual(await response.json(), { error: 'current_booking_actor_unconfirmed', retryable: false });
  } finally { f.close(); }
});

test('admission lost during the facility read prevents promotion and event mutation', async () => {
  const f = fixture();
  try {
    f.state.withFacility = true; f.state.onFacilities = f.revoke;
    assert.equal((await f.request()).status, 403);
    assert.equal(f.state.promotions, 0); assert.equal(f.state.imports, 0);
  } finally { f.close(); }
});

test('an unknown import result is not automatically re-executed and does not disclose a private diagnostic', async () => {
  const f = fixture();
  try {
    f.state.failImport = true;
    const response = await f.request(); assert.equal(response.status, 503);
    assert.equal(f.state.imports, 1); assert.equal(f.state.gets, 0);
    assert.ok(!(await response.text()).includes('private database diagnostic'));
  } finally { f.close(); }
});
