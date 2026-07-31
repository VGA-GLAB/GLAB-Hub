import { Hono, getDisplayName, getIdentity, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema } from '../data.ts';
import { resolveRoles } from './audience.ts';

const roleDefSchema = z.object({ key: z.string().regex(/^[a-z][a-z0-9_-]{0,62}$/), label: z.string().min(1).max(80), sort: z.number().int() }).strict();
const memberRoleSchema = z.object({ userId: z.string().min(1).max(128), role: z.string().regex(/^[a-z][a-z0-9_-]{0,62}$/) }).strict();

const rolesModule: CorpusModule = {
  id: 'roles',
  title: '役職',
  icon: '🏷️',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const r = new Hono();
    r.get('/me', (c) => c.json({ roles: resolveRoles(ctx.db, getIdentity(c).userId) }));
    r.get('/defs', (c) => c.json({ defs: ctx.db.prepare('SELECT key, label, sort FROM glab_role_def ORDER BY sort ASC, key ASC').all() }));
    r.get('/members', (c) => {
      const role = c.req.query('role')?.trim();
      if (!role) return c.json({ error: 'role_required' }, 400);
      const members = ctx.db.prepare('SELECT user_id AS userId, role, created_at AS createdAt FROM glab_member_role WHERE role = ? ORDER BY created_at ASC').all(role)
        .map((row) => {
          const member = row as { userId: string; role: string; createdAt: number };
          return { ...member, displayName: getDisplayName(ctx.db, member.userId) };
        });
      return c.json({ members });
    });
    r.post('/defs', requireAdmin, async (c) => {
      const parsed = roleDefSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_role_def' }, 400);
      ctx.db.prepare('INSERT INTO glab_role_def (key, label, sort) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET label = excluded.label, sort = excluded.sort').run(parsed.data.key, parsed.data.label, parsed.data.sort);
      return c.json({ ok: true });
    });
    r.delete('/defs/:key', requireAdmin, (c) => {
      ctx.db.prepare('DELETE FROM glab_role_def WHERE key = ?').run(c.req.param('key'));
      return c.json({ ok: true });
    });
    r.post('/members', requireAdmin, async (c) => {
      const parsed = memberRoleSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_member_role' }, 400);
      ctx.db.prepare('INSERT INTO glab_member_role (user_id, role, created_at) VALUES (?, ?, ?) ON CONFLICT(user_id, role) DO NOTHING').run(parsed.data.userId, parsed.data.role, Date.now());
      return c.json({ ok: true });
    });
    r.delete('/members/:userId/:role', requireAdmin, (c) => {
      ctx.db.prepare('DELETE FROM glab_member_role WHERE user_id = ? AND role = ?').run(c.req.param('userId'), c.req.param('role'));
      return c.json({ ok: true });
    });
    ctx.registerRoute(r);
    ctx.registerPanel({ title: '役職', icon: '🏷️' });
  },
};

export default rolesModule;
