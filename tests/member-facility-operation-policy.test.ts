/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { Hono, type AuthIdentity, type Context, type CorpusContext, type ServiceConnector, type TokenProvider } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { facilityOperationPolicy } from '../plugins/access/facility-operations.ts';
import { classifyDownstreamOperation, AEDILIS_GLAB_PREFIX } from '../plugins/downstream-operations.ts';
import facilityModule from '../plugins/facility/index.ts';
import { setBoundTestUser, testDelegationProvider } from './bound-user-fixture.ts';

const identity: AuthIdentity = { userId: 'subject', externalId: 'subject', role: 'general', displayName: 'Subject', projectKey: 'glab', isAdmin: false };
const id = '00000000-0000-4000-8000-000000000001';
test('seven source actions require current admission and leave missing/other target operations refused', async () => {
  let admitted = true;
  configureAdmissionPolicy({ prepare: (sql: string) => ({ get: () => {
    assert.match(sql, /glab_admission/); return { status: admitted ? 'approved' : 'rejected' };
  } }) } as unknown as SqlDb);
  for (const [method, path, risk] of [
    ['GET', '/facilities', 'read'], ['GET', '/facilities/room', 'read'],
    ['GET', '/reservations', 'sensitive_read'], ['GET', '/reservations/mine', 'sensitive_read'],
    ['POST', '/reservations', 'important'], ['PATCH', '/reservations/' + id, 'important'], ['DELETE', '/reservations/' + id, 'important'],
  ]) {
    const c = { req: { method, path: '/api/x/facility' + path } } as unknown as Context;
    const operation = facilityOperationPolicy(c); assert.ok(operation); assert.equal(operation.risk, risk);
    assert.equal(await operation.authorizeResource(c, identity), true);
    admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); admitted = true;
    assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
  }
  for (const [method, path] of [['GET', '/reservations/' + id], ['GET', '/reservations/public'], ['HEAD', '/facilities'],
    ['POST', '/facilities/room/overlap'], ['GET', '/meet/status'], ['POST', '/meetings'], ['PATCH', '/reservations/not-an-id']]) {
    assert.equal(facilityOperationPolicy({ req: { method, path: '/api/x/facility' + path } } as unknown as Context), null);
  }
  for (const path of ['/api/facilities', '/api/reservations', '/api/reservations/capabilities', AEDILIS_GLAB_PREFIX + '/reservations/' + id]) {
    assert.equal(classifyDownstreamOperation('aedilis', 'GET', path), null);
  }
});

test('real facility module reaches only the exact eight scoped target shapes with a bound signed request', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    const secret = randomBytes(48).toString('base64url');
    const authorizations: { path: string; action: string }[] = [];
    const sent: { path: string; method: string }[] = [];
    const provider: TokenProvider = { mode: 'unit-fixture', authorize: async (session, target, operation) => {
      assert.ok(session); assert.equal(session.grant.user.id, identity.userId); assert.equal(target.projectKey, 'aedilis');
      authorizations.push({ path: operation.path, action: operation.action });
      return testDelegationProvider().authorize(session, target, operation);
    } };
    let routes: Hono | undefined;
    await facilityModule.setup({ db, env: (key: string) => key === 'AEDILIS_BASE_URL' ? 'https://aedilis.fixture.invalid' : key === 'GLAB_AEDILIS_CONTEXT_SECRET' ? secret : undefined,
      tokenProvider: provider, identityProvider: { organizations: async () => [] },
      registerConnector: (connector: ServiceConnector) => { connector.fetch = async (path: string, init?: RequestInit) => {
        sent.push({ path, method: init?.method ?? 'GET' });
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('authorization'), `Cernere-Delegation ${'d'.repeat(43)}`);
        assert.equal(headers.get('cookie'), null);
        if (path.startsWith(AEDILIS_GLAB_PREFIX + '/reservations')) assert.ok(init?.signal instanceof AbortSignal);
        if (path === AEDILIS_GLAB_PREFIX + '/reservations/capabilities') return Response.json({ groupContextVersion: 1 });
        if (path.startsWith(AEDILIS_GLAB_PREFIX + '/reservations')) {
          const payload = headers.get('x-glab-booking-context')?.split('.')[0]; assert.ok(payload);
          const context = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
          assert.equal(context.userId, identity.userId); assert.equal(context.path, path);
          assert.equal(context.method, init?.method);
          assert.equal(context.bodyHash, createHash('sha256').update(typeof init?.body === 'string' ? init.body : '').digest('hex'));
        }
        return Response.json({ ok: true });
      }; }, registerRoute: (route: Hono) => { routes = route; }, registerPanel() {}, logger: { info() {}, error() {} },
    } as unknown as CorpusContext);
    configureAdmissionPolicy(db as unknown as SqlDb);
    db.prepare('INSERT INTO glab_admission(user_id,status,requested_at) VALUES (?,?,?)').run(identity.userId, 'approved', 0);
    assert.ok(routes);
    const app = new Hono(); app.use('*', async (c, next) => { setBoundTestUser(c, identity); await next(); }); app.route('/', routes);
    for (const [method, path, action] of [
      ['GET', '/facilities', 'facility.list'], ['GET', '/facilities/room', 'facility.read'],
      ['GET', '/reservations', 'reservations.list'], ['GET', '/reservations/mine', 'reservations.own'],
      ['POST', '/reservations', 'reservations.create'], ['PATCH', '/reservations/' + id, 'reservations.update'], ['DELETE', '/reservations/' + id, 'reservations.delete'],
    ] as const) {
      const response = await app.request(path + '?marker=exact', { method,
        ...(['GET', 'DELETE'].includes(method) ? {} : { body: '{"purpose":"Fixture"}', headers: { 'content-type': 'application/json' } }) });
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(sent.at(-1)?.path, AEDILIS_GLAB_PREFIX + path + '?marker=exact');
      assert.equal(sent.at(-1)?.method, method); assert.equal(authorizations.at(-1)?.action, action);
    }
    assert.equal(sent.length, 12); assert.equal(authorizations.length, 12); // Five booking operations each probe capabilities once.
  } finally { db.close(); }
});
