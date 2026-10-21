import assert from 'node:assert/strict';
import { it } from 'node:test';
import Database from 'better-sqlite3';
import { Hono, type CorpusContext } from '../corpus/server/hub/sdk.ts';
import { GLAB_SCHEMA, requestEventAttendance, eventAttendanceApprovals } from '../plugins/data.ts';
import { registerEventAttendance } from '../plugins/attendance/event-approval-routes.ts';

it('only the organizer can approve a request and recurring occurrences remain separate', async () => {
  const db = new Database(':memory:');
  try {
    db.exec(GLAB_SCHEMA);
    db.exec('CREATE TABLE glab_member_role (user_id TEXT, role TEXT)');
    const start = Date.now() - 1000;
    requestEventAttendance(db, 7, start, 'member', start);
    requestEventAttendance(db, 7, start - 604800000, 'member', start);
    const app = new Hono();
    let organizer = false;
    app.use('*', async (c, next) => {
      c.set('auth', { userId: organizer ? 'host' : 'admin', externalId: 'x', displayName: 'test', isAdmin: true, role: 'admin' });
      await next();
    });
    const event = { id: 7, starts_at: start, created_by: 'host', audience_roles: null };
    registerEventAttendance(app, { db } as unknown as CorpusContext,
      (() => ({ list: async () => [event] })) as unknown as Parameters<typeof registerEventAttendance>[2]);
    const approve = () => app.request('/events/approve', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: 7, startsAt: start, userId: 'member' }) });
    assert.equal((await approve()).status, 403);
    assert.equal(eventAttendanceApprovals(db, 7, start)[0]?.approved_at, null);
    organizer = true;
    assert.equal((await approve()).status, 200);
    assert.equal((await approve()).status, 200);
    assert.equal(eventAttendanceApprovals(db, 7, start)[0]?.approved_by, 'host');
    assert.equal(eventAttendanceApprovals(db, 7, start - 604800000)[0]?.approved_at, null);
  } finally { db.close(); }
});
