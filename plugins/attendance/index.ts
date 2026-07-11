// GLAB モジュール 1: 現在の出席状況。
// user_id と出席状況は GLAB 固有データとして共有 SQLite に保存する。
// 名前・役職・学科は Cernere の vantan_user を正本とし、このテーブルへ複製しない。

import { Hono, getIdentity, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusDb, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import {
  ATTENDANCE_STATUSES,
  ensureGlabUser,
  ensureSchema,
  listGlabUsers,
  setAttendanceStatus,
  type GlabUserRow,
} from '../data.ts';

const attendanceInputSchema = z.object({
  status: z.enum(ATTENDANCE_STATUSES),
}).strict();

function attendanceView(row: GlabUserRow): Record<string, unknown> {
  return {
    userId: row.user_id,
    status: row.attendance_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function makeRoutes(db: CorpusDb): Hono {
  const router = new Hono();

  router.get('/mine', (c) => {
    const identity = getIdentity(c);
    return c.json({ user: attendanceView(ensureGlabUser(db, identity.userId)) });
  });

  router.get('/list', requireAdmin, (c) => {
    return c.json({ users: listGlabUsers(db).map(attendanceView) });
  });

  router.put('/:userId/status', requireAdmin, async (c) => {
    const parsed = attendanceInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_attendance_status' }, 400);
    const actor = getIdentity(c);
    const updated = setAttendanceStatus(
      db,
      c.req.param('userId'),
      parsed.data.status,
      actor.userId,
    );
    if (!updated) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true, user: attendanceView(updated) });
  });

  return router;
}

const attendanceModule: CorpusModule = {
  id: 'attendance',
  title: '出席',
  icon: '✅',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    ctx.registerRoute(makeRoutes(ctx.db));
    ctx.registerPanel({ title: '出席', icon: '✅' });
    ctx.logger.info('attendance ready (GLAB-owned user_id + current status)');
  },
};

export default attendanceModule;
