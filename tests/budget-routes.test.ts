import assert from 'node:assert/strict';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { Hono } from '../corpus/server/hub/sdk.ts';
import { GLAB_SCHEMA } from '../plugins/data.ts';
import { budgetRoutes } from '../plugins/library/budget-routes.ts';

test('budget writes require admin, validate yen, and reuse stable IDs', async () => {
  const db = new Database(':memory:'); db.exec(GLAB_SCHEMA);
  try {
    const app = (admin: boolean, authenticated = true): Hono => {
      const r = new Hono();
      r.use('*', async (c, next) => {
        if (authenticated) {
          c.set('userToken', 'test-only');
          c.set('auth', { userId: 'self', isAdmin: admin });
        }
        await next();
      });
      r.route('/', budgetRoutes(db));
      return r;
    };
    const item = { id: 'c44a8dd5-8553-4d0b-98fb-45af55880098', fiscalYear: 2026,
      label: 'Books', allocatedYen: 10000, spentYen: 2000 };
    const put = (body: unknown): RequestInit => ({ method: 'PUT',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await app(false, false).request('/budget')).status, 401);
    assert.equal((await app(false).request('/budget', put(item))).status, 403);
    assert.equal((await app(true).request('/budget', put({ ...item, spentYen: -1 }))).status, 400);
    assert.equal((await app(true).request('/budget', put({ ...item, allocatedYen: 1.5 }))).status, 400);
    assert.equal((await app(true).request('/budget', put(item))).status, 200);
    assert.equal((await app(true).request('/budget', put({ ...item, spentYen: 3000 }))).status, 200);
    const response = await app(false).request('/budget');
    const data = await response.json() as { items: Array<{ spentYen: number }>; canEdit: boolean };
    assert.equal(data.items.length, 1);
    assert.equal(data.items[0]?.spentYen, 3000);
    assert.equal(data.canEdit, false);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
  } finally { db.close(); }
});
