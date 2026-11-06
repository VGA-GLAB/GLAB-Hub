/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context, ServiceConnector, TokenProvider } from '../corpus/server/hub/sdk.ts';
import { Hono } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { lendingOperationPolicy } from '../plugins/access/lending-operations.ts';
import { classifyDownstreamOperation } from '../plugins/downstream-operations.ts';
import { libraryRoutes } from '../plugins/library/routes.ts';
import { setBoundTestUser, testDelegationProvider } from './bound-user-fixture.ts';

const identity: AuthIdentity = { userId: 'member', externalId: 'member', role: 'general', displayName: 'Member', projectKey: 'glab', isAdmin: false };
const context = (method: string, path: string): Context => ({ req: { method, path } } as unknown as Context);

test('lending authorization checks current admission and retains source administrator restriction', async () => {
  let admitted = true;
  configureAdmissionPolicy({ prepare: (sql: string) => ({ get: () => {
    assert.match(sql, /glab_admission/);
    return { status: admitted ? 'approved' : 'rejected' };
  } }) } as unknown as SqlDb);
  for (const path of ['equipment', 'books', 'lookup', 'me', 'loans/mine']) {
    const c = context('GET', `/api/x/library/${path}`);
    const policy = lendingOperationPolicy(c);
    assert.ok(policy);
    assert.equal(await policy.authorizeResource(c, identity), true);
    admitted = false;
    assert.equal(await policy.authorizeResource(c, identity), false);
    admitted = true;
  }
  const c = context('POST', '/api/x/library/books');
  const books = lendingOperationPolicy(c);
  assert.ok(books);
  assert.equal(books.risk, 'important');
  assert.equal(await books.authorizeResource(c, identity), false);
  assert.equal(await books.authorizeResource(c, { ...identity, isAdmin: true }), true);
  assert.equal(lendingOperationPolicy(context('HEAD', '/api/x/library/equipment')), null);
  assert.equal(lendingOperationPolicy(context('POST', '/api/x/library/equipment')), null);
  assert.equal(lendingOperationPolicy(context('GET', '/api/x/library/loans/open')), null);
});

test('all seven callers issue only the target-owned exact path/action and reach that request', async () => {
  const rows = [
    ['GET', 'equipment', 'items/equipment', 'equipment.list'],
    ['GET', 'books', 'items/books', 'inventory.books.list'],
    ['POST', 'books', 'items/books', 'inventory.books.create'],
    ['GET', 'lookup', 'items/lookup', 'items.lookup'],
    ['GET', 'me', 'me', 'identity.self.read'],
    ['GET', 'loans/mine', 'loans/mine', 'loans.own.read'],
    ['POST', 'loans', 'loans', 'loans.create'],
  ] as const;
  for (const [method, source, destination, action] of rows) {
    const targetPath = `/api/integrations/glab/${destination}?marker=exact`;
    let authorizations = 0, fetches = 0;
    const provider: TokenProvider = { mode: 'unit-fixture', authorize: async (session, target, operation) => {
      authorizations++;
      assert.ok(session);
      assert.equal(target.projectKey, 'bibliotheca');
      assert.equal(operation.path, targetPath);
      assert.equal(operation.action, action);
      return testDelegationProvider().authorize(session, target, operation);
    } };
    const connector: ServiceConnector = { id: 'bibliotheca', title: 'Library', scope: 'multi', baseUrl: 'https://bb.example.test',
      health: async () => ({ status: 'up' }), fetch: async (path, init) => {
        fetches++;
        assert.equal(path, targetPath);
        assert.equal(init?.method, method);
        assert.equal(new Headers(init?.headers).get('cookie'), null);
        return Response.json({ ok: true });
      } };
    const app = new Hono();
    app.use('*', async (c, next) => { setBoundTestUser(c); await next(); });
    app.route('/', libraryRoutes(connector, provider));
    const response = await app.request(`/${source}?marker=exact`, { method,
      ...(method === 'POST' ? { body: '{}', headers: { 'content-type': 'application/json' } } : {}) });
    assert.equal(response.status, 200);
    assert.equal(authorizations, 1);
    assert.equal(fetches, 1);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  }
});

test('retired direct target paths and unclassified methods cannot mint a delegation', () => {
  for (const path of ['/api/items/books', '/api/loans', '/api/me', '/api/integrations/glab/items/equipment/bulk']) {
    assert.equal(classifyDownstreamOperation('bibliotheca', 'POST', path), null);
    assert.equal(classifyDownstreamOperation('bibliotheca', 'GET', path), null);
  }
  assert.equal(classifyDownstreamOperation('bibliotheca', 'HEAD', '/api/integrations/glab/items/equipment'), null);
});
