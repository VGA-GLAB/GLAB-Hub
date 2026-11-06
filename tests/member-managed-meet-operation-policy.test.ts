/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { Hono, type AuthIdentity, type Context, type CorpusContext, type ServiceConnector, type TokenProvider } from '../corpus/server/hub/sdk.ts';
import { runServiceOperation, type ServiceOperationGate } from '../corpus/server/service-operation-gate.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { managedMeetOperationPolicy } from '../plugins/access/managed-meet-operations.ts';
import { classifyDownstreamOperation, AEDILIS_MANAGED_MEET_PREFIX as target } from '../plugins/downstream-operations.ts';
import facilityModule from '../plugins/facility/index.ts';
import { boundTestSession, setBoundTestUser, testDelegationProvider } from './bound-user-fixture.ts';

const identity: AuthIdentity = { userId: 'subject', externalId: 'subject', role: 'general', displayName: 'Subject', projectKey: 'glab', isAdmin: false };
const id = '00000000-0000-4000-8000-000000000001';
const rows = [['GET', '/status', 'status.read'], ['POST', '/oauth/start', 'oauth.start'],
  ['GET', '/oauth/callback', 'oauth.complete'], ['GET', '/' + id, 'read'], ['POST', '/' + id, 'create']] as const;

test('five exact source operations retain live admission and callback GET is important with a private query', async () => {
  let admitted = true;
  configureAdmissionPolicy({ prepare: () => ({ get: () => ({ status: admitted ? 'approved' : 'rejected' }) }) } as unknown as SqlDb);
  for (const [method, path, action] of rows) {
    const c = { req: { method, path: '/api/x/facility/meet' + path } } as unknown as Context;
    const operation = managedMeetOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, 'facility.meet.' + action);
    assert.equal(operation.risk, method === 'GET' && action !== 'oauth.complete' ? 'sensitive_read' : 'important');
    assert.equal(operation.privateQuery, action === 'oauth.complete' ? true : undefined);
    assert.equal(operation.maximumBodyBytes, method === 'GET' ? 0 : 8192);
    assert.equal(await operation.authorizeResource(c, identity), true);
    admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); admitted = true;
    assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
  }
  for (const [method, path] of [['HEAD', '/status'], ['GET', '/oauth/start'], ['POST', '/oauth/callback'], ['GET', '/oauth/complete'], ['DELETE', '/' + id], ['GET', '/external/glab-event/1']]) {
    assert.equal(managedMeetOperationPolicy({ req: { method, path: '/api/x/facility/meet' + path } } as unknown as Context), null);
  }
  for (const [method, suffix, action] of [['GET', '/status', 'meet.status.read'], ['POST', '/oauth/start', 'meet.oauth.start'],
    ['POST', '/oauth/complete', 'meet.oauth.complete'], ['GET', '/' + id, 'meet.read'], ['POST', '/' + id, 'meet.create'],
    ['POST', '/external/glab-event/1', 'meet.external.create']]) {
    assert.equal(classifyDownstreamOperation('aedilis', method!, target + suffix)?.action, action);
    assert.equal(classifyDownstreamOperation('aedilis', method!, '/api/meet' + suffix), null);
  }
});

async function fixture() {
  const db = new DatabaseSync(':memory:'), secret = randomBytes(48).toString('base64url');
  const sent: { path: string; body: string; action: string }[] = [], resources: string[] = [];
  const state = { reply: { mode: 'creator' } as unknown, afterFetch: () => {} };
  let action = '', routes: Hono | undefined;
  try {
    const provider: TokenProvider = { mode: 'unit-fixture', authorize: async (session, destination, operation) => {
      assert.equal(destination.projectKey, 'aedilis'); action = operation.action;
      return testDelegationProvider().authorize(session, destination, operation);
    } };
    await facilityModule.setup({ db, env: (key: string) => key === 'AEDILIS_BASE_URL' ? 'https://aedilis.fixture.invalid' : key === 'GLAB_AEDILIS_CONTEXT_SECRET' ? secret : undefined,
      tokenProvider: provider, identityProvider: { organizations: async () => [] },
      registerConnector: (connector: ServiceConnector) => { connector.fetch = async (path: string, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get('cookie'), null); assert.equal(headers.get('authorization'), 'Cernere-Delegation ' + 'd'.repeat(43));
        if (path === '/api/integrations/glab/reservations/capabilities') return Response.json({ groupContextVersion: 1 });
        const encoded = headers.get('x-glab-booking-context')?.split('.')[0]; assert.ok(encoded);
        const context = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
        const body = typeof init?.body === 'string' ? init.body : '';
        assert.equal(context.path, path); assert.equal(context.method, init?.method); assert.equal(context.userId, identity.userId);
        assert.equal(context.bodyHash, createHash('sha256').update(body).digest('hex'));
        sent.push({ path, body, action }); state.afterFetch();
        return Response.json(state.reply);
      }; }, registerRoute: (value: Hono) => { routes = value; }, registerPanel() {}, logger: { info() {}, error() {} },
    } as unknown as CorpusContext);
    configureAdmissionPolicy(db as unknown as SqlDb);
    db.prepare('INSERT INTO glab_admission(user_id,status,requested_at) VALUES (?,?,?)').run(identity.userId, 'approved', 0);
    assert.ok(routes);
    const gate: ServiceOperationGate = { policy: managedMeetOperationPolicy,
      sessions: { run: async (_token, operation, callbacks) => {
        resources.push(operation.resource);
        if (!await callbacks.authorizeResource({ requestId: 'fixture', risk: callbacks.risk })) throw new Error('Denied');
        return callbacks.execute();
      } }, delegations: { run: async () => { throw new Error('Unexpected incoming delegation'); } },
      identity: () => identity, isCurrent: () => true };
    const app = new Hono(); app.use('*', async (c, next) => {
      setBoundTestUser(c, identity);
      return runServiceOperation(c, next, gate, { session: boundTestSession(identity), identity });
    }); app.route('/api/x/facility', routes);
    return { db, app, state, sent, resources };
  } catch (error) { db.close(); throw error; }
}

test('the actual callback binds private query at the shared gate and relays exact signed JSON once', async () => {
  const f = await fixture();
  const state = randomBytes(32).toString('base64url'), code = randomBytes(24).toString('base64url');
  const query = new URLSearchParams({ state, code }).toString();
  try {
    const response = await f.app.request('https://glab.fixture.invalid/api/x/facility/meet/oauth/callback?' + query);
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    const html = await response.text(); assert.equal(html.includes(state), false); assert.equal(html.includes(code), false);
    assert.deepEqual(f.resources, ['/api/x/facility/meet/oauth/callback#query-sha256=' + createHash('sha256').update('?' + query).digest('hex')]);
    assert.deepEqual(f.sent, [{ path: target + '/oauth/complete', action: 'meet.oauth.complete', body: JSON.stringify({ state, code }) }]);
    for (const suffix of ['&code=another', '&st%61te=another', '&error=']) {
      assert.equal((await f.app.request('https://glab.fixture.invalid/api/x/facility/meet/oauth/callback?' + query + suffix)).status, 400);
    }
    assert.equal(f.sent.length, 1);
  } finally { f.db.close(); }
});

test('actual status, OAuth start and meeting handlers use only their exact scoped target contracts', async () => {
  const f = await fixture();
  try {
    for (const [method, suffix, action] of rows.filter(([, , name]) => name !== 'oauth.complete')) {
      const url = 'https://glab.fixture.invalid/api/x/facility/meet' + suffix + '?marker=exact';
      const response = await f.app.request(url, { method, headers: { 'content-type': 'application/json' },
        ...(method === 'POST' ? { body: JSON.stringify({ mode: 'creator' }) } : {}) });
      assert.equal(response.status, 200);
      const sent = f.sent.at(-1); assert.ok(sent);
      assert.equal(sent.path, target + suffix + (method === 'GET' ? '?marker=exact' : ''));
      assert.equal(sent.action, 'meet.' + action);
      if (action === 'oauth.start') assert.deepEqual(JSON.parse(sent.body), {
        mode: 'creator', redirectUri: 'https://glab.fixture.invalid/api/x/facility/meet/oauth/callback',
      });
      if (action === 'create') assert.equal(sent.body, '{}');
    }
    assert.equal(f.sent.length, 4);
  } finally { f.db.close(); }
});

test('callback cannot announce success for an unknown target result or admission revoked after the target response', async () => {
  const f = await fixture();
  const url = 'https://glab.fixture.invalid/api/x/facility/meet/oauth/callback?state=' + 'a'.repeat(43) + '&code=once';
  try {
    f.state.reply = { unexpected: true };
    assert.equal((await f.app.request(url)).status, 503);
    f.state.reply = { mode: 'creator' };
    f.state.afterFetch = () => { f.db.prepare("UPDATE glab_admission SET status='rejected' WHERE user_id=?").run(identity.userId); };
    const response = await f.app.request(url);
    assert.equal(response.status, 400);
    assert.equal((await response.text()).includes('Google アカウントを連携しました'), false);
    assert.equal(f.sent.length, 2);
  } finally { f.db.close(); }
});
