import { Hono, getIdentity, getUserToken } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import type { SqlDb } from '../data.ts';

export const budgetInput = z.object({
  id: z.string().uuid(),
  fiscalYear: z.number().int().min(2000).max(2100),
  label: z.string().trim().min(1).max(120),
  allocatedYen: z.number().int().min(0).max(1_000_000_000),
  spentYen: z.number().int().min(0).max(1_000_000_000),
}).strict();

/** GLab owns club budgets; Bibliotheca only owns inventory and loans.
 * @implements SPEC-GLAB-BUDGET-001
 */
export function budgetRoutes(db: SqlDb): Hono {
  const r = new Hono();
  r.use('*', async (c, next) => {
    c.header('cache-control', 'private, no-store');
    if (!getUserToken(c)) return c.json({ error: 'unauthorized' }, 401);
    await next();
  });
  r.get('/budget', c => {
    const items = db.prepare(`SELECT id, fiscal_year AS fiscalYear, label,
      allocated_yen AS allocatedYen, spent_yen AS spentYen FROM glab_budget_item
      ORDER BY fiscal_year DESC, label, id`).all();
    return c.json({ items, canEdit: getIdentity(c).isAdmin });
  });
  r.put('/budget', async c => {
    const identity = getIdentity(c);
    if (!identity.isAdmin) return c.json({ error: 'forbidden' }, 403);
    const parsed = budgetInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_budget' }, 400);
    const v = parsed.data;
    db.prepare(`INSERT INTO glab_budget_item
      (id, fiscal_year, label, allocated_yen, spent_yen, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET fiscal_year=excluded.fiscal_year, label=excluded.label,
        allocated_yen=excluded.allocated_yen, spent_yen=excluded.spent_yen,
        updated_by=excluded.updated_by, updated_at=excluded.updated_at`)
      .run(v.id, v.fiscalYear, v.label, v.allocatedYen, v.spentYen, identity.userId, Date.now());
    return c.json({ ok: true });
  });
  return r;
}
