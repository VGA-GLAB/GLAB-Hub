import { getIdentity, getUserToken, getDisplayName, cacheDisplayName,
  type Hono, type CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { dateInJst, ensureSchema, type SqlDb } from '../data.ts';
import { canSee, parseAudience, resolveRoles } from '../roles/audience.ts';
import { getEventStore, type EventRow } from './store.ts';

interface AttendanceIdentity { user_id: string }

/** Actual checked-in people only. Anonymous poll answers and missing check-ins are not absences. */
export function eventAttendance(db: SqlDb, eventId: number, date: string): { present: string[]; absent: string[] } {
  const present = (db.prepare('SELECT DISTINCT user_id FROM glab_attendance WHERE event_id=? AND date=?')
    .all(eventId, date) as AttendanceIdentity[]).map(row => row.user_id);
  const presentIds = new Set(present);
  const absent = (db.prepare('SELECT user_id FROM glab_event_absence WHERE event_id=? ORDER BY reported_at')
    .all(eventId) as AttendanceIdentity[]).map(row => row.user_id).filter(id => !presentIds.has(id));
  return { present, absent };
}

export function registerEventAttendance(routes: Hono, ctx: CorpusContext,
  findEvent: (id: number) => Promise<EventRow | null> = id => getEventStore().get(id)): void {
  ensureSchema(ctx.db);
  routes.use('/events/:id/attendance', async (c, next) => {
    c.header('cache-control', 'private, no-store');
    if (!getUserToken(c)) return c.json({ error: 'ログインしてください' }, 401);
    await next();
  });
  routes.on(['GET', 'PUT'], '/events/:id/attendance', async c => {
    const identity = getIdentity(c), id = Number(c.req.param('id'));
    if (!identity.userId) return c.json({ error: 'ログインしてください' }, 401);
    if (!Number.isSafeInteger(id) || id <= 0) return c.json({ error: 'invalid_event' }, 400);
    const event = await findEvent(id);
    if (!event || !canSee(parseAudience(event.audience_roles), resolveRoles(ctx.db, identity.userId),
      event.created_by === identity.userId, identity.isAdmin)) return c.json({ error: 'not_found' }, 404);
    // Polls create single occurrences. Do not conflate separate weeks in an attendance record.
    if (!event.meeting_id || event.recurrence !== 'none') return c.json({ error: '希望日調査から確定した予定が対象です' }, 400);
    if (c.req.method === 'PUT') {
      const body: unknown = await c.req.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some(key => key !== 'absent') || !('absent' in body) || typeof body.absent !== 'boolean') {
        return c.json({ error: 'invalid_absence' }, 400);
      }
      if ((event.ends_at ?? event.starts_at) < Date.now()) return c.json({ error: '終了した予定の欠席連絡は変更できません' }, 409);
      if (body.absent) {
        ctx.db.prepare(`INSERT INTO glab_event_absence(event_id,user_id,reported_at) VALUES(?,?,?)
          ON CONFLICT(event_id,user_id) DO UPDATE SET reported_at=excluded.reported_at`).run(id, identity.userId, Date.now());
      } else ctx.db.prepare('DELETE FROM glab_event_absence WHERE event_id=? AND user_id=?').run(id, identity.userId);
      if (identity.displayName) cacheDisplayName(ctx.db, identity.userId, identity.displayName);
    }
    const date = dateInJst(event.starts_at), attendance = eventAttendance(ctx.db, id, date);
    return c.json({ date, today: date === dateInJst(Date.now()),
      present: attendance.present.map(userId => ({ displayName: getDisplayName(ctx.db, userId) ?? '名前未登録' })),
      absent: attendance.absent.map(userId => ({ displayName: getDisplayName(ctx.db, userId) ?? '名前未登録' })),
      mine: attendance.present.includes(identity.userId) ? 'present' : attendance.absent.includes(identity.userId) ? 'absent' : 'unknown',
      canReport: (event.ends_at ?? event.starts_at) >= Date.now(),
    });
  });
}
