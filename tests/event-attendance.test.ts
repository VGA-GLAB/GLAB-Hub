import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openDb } from '../corpus/server/db.ts';
import { Hono, type CorpusContext } from '../corpus/server/hub/sdk.ts';
import { registerEventAttendance, eventAttendance } from '../plugins/events/attendance-routes.ts';
import { dateInJst } from '../plugins/data.ts';
import type { EventRow } from '../plugins/events/store.ts';

test('absence requires login, rejects supplied identities and is independent of anonymous poll answers', async () => {
  const db = openDb(':memory:');
  try {
    const app = new Hono();
    app.use('*', async (c, next) => {
      const userId = c.req.header('x-test-user');
      if (userId) {
        c.set('userToken', 'test');
        c.set('auth', { userId, externalId: userId, role: 'general', projectKey: null, isAdmin: false, displayName: null });
      }
      await next();
    });
    const event = { id: 1, meeting_id: 'poll', recurrence: 'none', audience_roles: null,
      starts_at: Date.now(), ends_at: Date.now() + 60_000, created_by: 'host' } as EventRow;
    registerEventAttendance(app, { db } as unknown as CorpusContext, async () => event);
    const request = (user: string | null, body: unknown) => app.request('/events/1/attendance', {
      method: 'PUT', headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: JSON.stringify(body),
    });
    assert.equal((await request(null, { absent: true })).status, 401);
    assert.equal((await request('student', { absent: true, userId: 'victim' })).status, 400);
    assert.equal((await request('student', { absent: true })).status, 200);
    assert.deepEqual(db.prepare('SELECT user_id FROM glab_event_absence').all(), [{ user_id: 'student' }]);
    assert.equal((await request('student', { absent: false })).status, 200);
    assert.deepEqual(db.prepare('SELECT user_id FROM glab_event_absence').all(), []);
    assert.deepEqual(eventAttendance(db, 1, dateInJst(event.starts_at)), { present: [], absent: [] });
    event.ends_at = Date.now() - 1;
    assert.equal((await request('student', { absent: true })).status, 409);
  } finally { db.close(); }
});

test('a verified check-in wins over an earlier absence and remains scoped to the event', () => {
  const db = openDb(':memory:');
  try {
    registerEventAttendance(new Hono(), { db } as unknown as CorpusContext, async () => null);
    db.prepare('INSERT INTO glab_event_absence VALUES(?,?,?)').run(1, 'student', 1);
    db.prepare(`INSERT INTO glab_attendance(id,user_id,date,facility_id,checked_in_at,source,event_id)
      VALUES(?,?,?,?,?,?,?)`).run('check', 'student', '2026-10-18', 'room', 1, 'passkey', 1);
    assert.deepEqual(eventAttendance(db, 1, '2026-10-18'), { present: ['student'], absent: [] });
    assert.deepEqual(eventAttendance(db, 2, '2026-10-18'), { present: [], absent: [] });
  } finally { db.close(); }
});
