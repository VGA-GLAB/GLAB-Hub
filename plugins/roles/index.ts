import { Hono, getDisplayName, getIdentity, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema } from '../data.ts';
import { resolveRoles } from './audience.ts';
import {
  addMemberRole,
  deleteRoleDef,
  listMembersByRole,
  listRoleDefs,
  removeMemberRole,
  upsertRoleDef,
} from './store.ts';

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
    r.get('/defs', (c) => c.json({ defs: listRoleDefs(ctx.db) }));
    r.get('/members', (c) => {
      const role = c.req.query('role')?.trim();
      if (!role) return c.json({ error: 'role_required' }, 400);
      const members = listMembersByRole(ctx.db, role)
        .map((member) => ({ ...member, displayName: getDisplayName(ctx.db, member.userId) }));
      return c.json({ members });
    });
    r.post('/defs', requireAdmin, async (c) => {
      const parsed = roleDefSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_role_def' }, 400);
      upsertRoleDef(ctx.db, parsed.data);
      return c.json({ ok: true });
    });
    r.delete('/defs/:key', requireAdmin, (c) => {
      deleteRoleDef(ctx.db, c.req.param('key'));
      return c.json({ ok: true });
    });
    r.post('/members', requireAdmin, async (c) => {
      const parsed = memberRoleSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_member_role' }, 400);
      addMemberRole(ctx.db, parsed.data.userId, parsed.data.role, Date.now());
      return c.json({ ok: true });
    });
    r.delete('/members/:userId/:role', requireAdmin, (c) => {
      removeMemberRole(ctx.db, c.req.param('userId'), c.req.param('role'));
      return c.json({ ok: true });
    });
    ctx.registerRoute(r);
    ctx.registerPanel({ title: '役職', icon: '🏷️' });
  },
};

export default rolesModule;
