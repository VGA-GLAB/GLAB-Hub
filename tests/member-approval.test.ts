import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../corpus/server/db.ts';
import { Hono } from '../corpus/server/hub/sdk.ts';
import { ensureSchema } from '../plugins/data.ts';
import { configureAdmissionPolicy, memberAccessPolicy } from '../plugins/access/policy.ts';
import { decideAdmission, readAdmission, recordRegistration } from '../plugins/access/store.ts';
import { syncRegistrations } from '../plugins/access/registration-sync.ts';
import type { CernereProjectApi } from '../plugins/cernere/shared-owner.ts';

test('pending and revoked users cannot bypass the member gate through API or MCP', async () => {
  const db = openDb(':memory:');
  try {
    ensureSchema(db);
    configureAdmissionPolicy(db);
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('auth', { userId: 'member', externalId: 'member', role: 'general', projectKey: null, isAdmin: false, displayName: null });
      await next();
    });
    app.use('*', memberAccessPolicy);
    app.get('/api/hub/connectors', c => c.json({ connectors: [{ id: 'internal', title: 'Di', scope: 'local', health: { status: 'up', detail: 'internal-address' } }] }));
    app.all('*', c => c.json({ secretMemberData: true }));
    for (const path of ['/api/x/events/events', '/api/hub/data/di/conclusions', '/api/capabilities', '/mcp']) {
      assert.equal((await app.request(path)).status, 403);
    }
    assert.deepEqual(await (await app.request('/api/hub/connectors')).json(), { connectors: [{ title: 'Di', health: { status: 'up' } }] });
    assert.deepEqual(await (await app.request('/api/hub/modules')).json(), { modules: [] });
    assert.equal((await app.request('/api/hub/connectors', { method: 'POST' })).status, 403);
    assert.equal(decideAdmission(db, 'member', 'approved', 0, 'admin', 100), true);
    assert.equal((await app.request('/api/x/events/events')).status, 200);
    assert.equal(decideAdmission(db, 'member', 'rejected', 0, 'stale-admin', 101), false);
    assert.equal(decideAdmission(db, 'member', 'rejected', 1, 'admin', 102), true);
    assert.equal((await app.request('/api/x/events/events')).status, 403);
    recordRegistration(db, 'member', 103);
    assert.equal(readAdmission(db, 'member')?.status, 'rejected');
    assert.equal(readAdmission(db, 'member')?.decided_by, 'admin');
  } finally { db.close(); }
});

test('registration replay deduplicates, preserves approval and suppresses historical mentions', async () => {
  const db = openDb(':memory:');
  const oldId = '00000000-0000-4000-8000-000000000001';
  const newId = '00000000-0000-4000-8000-000000000002';
  try {
    ensureSchema(db);
    db.prepare('UPDATE glab_admission_sync SET enabled_at = ?').run(Date.parse('2026-10-22T00:00:00Z'));
    const page = { registrations: [
      { userId: oldId, createdAt: '2026-10-21T00:00:00Z' },
      { userId: newId, createdAt: '2026-10-22T01:00:00Z' },
    ], next: null };
    const client = { call: async (module: string, action: string) => {
      assert.equal(module, 'managed_project'); assert.equal(action, 'list_registrations'); return page;
    } } as unknown as CernereProjectApi;
    await syncRegistrations(db, client);
    assert.equal(decideAdmission(db, newId, 'approved', 0, 'admin', 1), true);
    await syncRegistrations(db, client);
    assert.equal(readAdmission(db, newId)?.status, 'approved');
    assert.deepEqual(db.prepare('SELECT user_id, notification_state FROM glab_admission ORDER BY user_id').all(), [
      { user_id: oldId, notification_state: 'sent' }, { user_id: newId, notification_state: 'pending' },
    ]);
    const invalid = { call: async () => ({ registrations: [{ userId: 'arbitrary', createdAt: 'bad' }], next: null }) } as unknown as CernereProjectApi;
    await assert.rejects(syncRegistrations(db, invalid));
    assert.deepEqual(db.prepare('SELECT COUNT(*) AS count FROM glab_admission').get(), { count: 2 });
  } finally { db.close(); }
});
