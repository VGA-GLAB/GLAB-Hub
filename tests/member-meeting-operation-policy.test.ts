/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { Hono, type AuthIdentity, type Context, type CorpusContext, type ServiceConnector, type TokenProvider } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { meetingOperationPolicy } from '../plugins/access/meeting-operations.ts';
import { classifyDownstreamOperation, AEDILIS_MEETING_PREFIX, AEDILIS_GLAB_PREFIX } from '../plugins/downstream-operations.ts';
import facilityModule from '../plugins/facility/index.ts';
import { setBoundTestUser, testDelegationProvider } from './bound-user-fixture.ts';

const identity: AuthIdentity = { userId: 'subject', externalId: 'subject', role: 'general', displayName: 'Subject', projectKey: 'glab', isAdmin: false };
const id = '00000000-0000-4000-8000-000000000001', responseId = '00000000-0000-4000-8000-000000000002';
const rows = [
  ['GET', '', 'list.read'], ['GET', '/mine', 'mine.read'], ['POST', '', 'create'],
  ['GET', '/' + id, 'read'], ['PATCH', '/' + id, 'update'], ['DELETE', '/' + id, 'cancel'],
  ['POST', '/' + id + '/finalize', 'finalize'], ['POST', '/' + id + '/responses', 'response.create'],
  ['PATCH', '/' + id + '/responses/' + responseId, 'response.update'],
  ['POST', '/' + id + '/glab-event', 'glab-event.finalize'],
] as const;

test('ten meeting source actions require fresh admission; unrelated session/Meet/guest routes remain refused', async () => {
  let admitted = true;
  configureAdmissionPolicy({ prepare: (sql: string) => ({ get: () => { assert.match(sql, /glab_admission/); return { status: admitted ? 'approved' : 'rejected' }; } }) } as unknown as SqlDb);
  for (const [method, suffix, action] of rows) {
    const c = { req: { method, path: '/api/x/facility/meetings' + suffix } } as unknown as Context;
    const operation = meetingOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, 'facility.meetings.' + action);
    assert.equal(operation.risk, method === 'GET' ? 'sensitive_read' : 'important');
    assert.equal(await operation.authorizeResource(c, identity), true);
    admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); admitted = true;
    assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
  }
  for (const [method, suffix] of [['POST', '/session'], ['POST', '/session/login/complete'], ['GET', '/config'],
    ['HEAD', ''], ['DELETE', '/' + id + '/responses/' + responseId], ['POST', '/' + id + '/glab-event/cancel'], ['GET', '/not-an-id']]) {
    assert.equal(meetingOperationPolicy({ req: { method, path: '/api/x/facility/meetings' + suffix } } as unknown as Context), null);
  }
  for (const [method, suffix] of rows) assert.equal(classifyDownstreamOperation('aedilis', method, '/api/meetings' + suffix), null);
  assert.equal(classifyDownstreamOperation('aedilis', 'HEAD', AEDILIS_MEETING_PREFIX), null);
});

test('actual poll relay handlers send the exact prepared target path, revision body and signed context', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const secret = randomBytes(48).toString('base64url');
    const sent: { path: string; method: string; body: BodyInit | null | undefined; action: string }[] = [];
    let preparedAction = '';
    const provider: TokenProvider = { mode: 'unit-fixture', authorize: async (session, target, operation) => {
      assert.ok(session); assert.equal(target.projectKey, 'aedilis'); assert.equal(session.grant.user.id, identity.userId);
      preparedAction = operation.action;
      assert.equal(operation.path.startsWith(AEDILIS_GLAB_PREFIX), true);
      return testDelegationProvider().authorize(session, target, operation);
    } };
    let routes: Hono | undefined;
    await facilityModule.setup({ db, env: (key: string) => key === 'AEDILIS_BASE_URL' ? 'https://aedilis.fixture.invalid' : key === 'GLAB_AEDILIS_CONTEXT_SECRET' ? secret : undefined,
      tokenProvider: provider, identityProvider: { organizations: async () => [] },
      registerConnector: (connector: ServiceConnector) => { connector.fetch = async (path: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), `Cernere-Delegation ${'d'.repeat(43)}`); assert.equal(headers.get('cookie'), null);
        assert.ok(init?.signal instanceof AbortSignal);
        if (path === AEDILIS_GLAB_PREFIX + '/reservations/capabilities') return Response.json({ groupContextVersion: 1 });
        const encoded = headers.get('x-glab-booking-context')?.split('.')[0]; assert.ok(encoded);
        const context = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
        assert.equal(context.path, path); assert.equal(context.method, init?.method); assert.equal(context.userId, identity.userId);
        assert.equal(context.bodyHash, createHash('sha256').update(typeof init?.body === 'string' ? init.body : '').digest('hex'));
        sent.push({ path, method: init?.method ?? 'GET', body: init?.body, action: preparedAction });
        return Response.json({ ok: true });
      }; }, registerRoute: (route: Hono) => { routes = route; }, registerPanel() {}, logger: { info() {}, error() {} },
    } as unknown as CorpusContext);
    configureAdmissionPolicy(db as unknown as SqlDb);
    db.prepare('INSERT INTO glab_admission(user_id,status,requested_at) VALUES (?,?,?)').run(identity.userId, 'approved', 0);
    assert.ok(routes);
    const app = new Hono(); app.use('*', async (c, next) => { setBoundTestUser(c, identity); await next(); }); app.route('/', routes);
    const body = '{ "revision": 1, "meetingRevision": 1 }';
    // The tenth operation imports into the GLAB store and has its own actual
    // handler/storage contracts rather than a synthetic successful snapshot.
    for (const [method, suffix, action] of rows.slice(0, 9)) {
      const response = await app.request('/meetings' + suffix + '?marker=exact', { method,
        headers: { 'content-type': 'application/json', cookie: 'browser-must-not-forward', authorization: 'Bearer browser-must-not-forward' },
        ...(method === 'GET' ? {} : { body }) });
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const last = sent.at(-1); assert.equal(last?.path, AEDILIS_MEETING_PREFIX + suffix + '?marker=exact');
      assert.equal(last?.method, method); assert.equal(last?.action, 'meetings.' + action);
      assert.equal(last?.body, method === 'GET' ? undefined : body);
    }
    assert.equal(sent.length, 9);
  } finally { db.close(); }
});
