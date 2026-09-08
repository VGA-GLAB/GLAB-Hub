import { Hono, getIdentity, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../data.ts';
import { z } from 'zod';
import { classifyJobOwners } from './owner-classification.ts';
import { migrateJobOwner, rollbackJobOwner } from './owner-migration.ts';

const migrationSchema = z.object({
  operationId: z.string().trim().min(1).max(200),
  expectedOwner: z.string().trim().min(1).max(200).nullable(),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1),
  ownerUserId: z.string().trim().min(1).max(200),
  evidenceKind: z.enum(['exact_user_id', 'admin_verified', 'authenticated_link']),
  evidenceRef: z.string().trim().min(1).max(1000),
});
const rollbackSchema = z.object({
  operationId: z.string().trim().min(1).max(200),
  auditId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export function registerOwnerRoutes(routes: Hono, db: SqlDb): void {
  routes.get('/owner-migration', requireAdmin, (c) => {
    c.header('Cache-Control', 'no-store');
    return c.json({ jobs: classifyJobOwners(db) });
  });
  routes.put('/:id/owner', requireAdmin, async (c) => {
    c.header('Cache-Control', 'no-store');
    const parsed = migrationSchema.safeParse(await c.req.json().catch(() => null));
    const jobId = Number(c.req.param('id'));
    if (!parsed.success || !Number.isSafeInteger(jobId) || jobId <= 0) return c.json({ error: 'invalid_owner_migration' }, 400);
    try {
      return c.json(migrateJobOwner(db, { ...parsed.data, jobId }, getIdentity(c).userId));
    } catch (error) {
      return ownerError(error);
    }
  });
  routes.post('/owner-migration/rollback', requireAdmin, async (c) => {
    const parsed = rollbackSchema.safeParse(await c.req.json().catch(() => null));
    c.header('Cache-Control', 'no-store');
    if (!parsed.success) return c.json({ error: 'invalid_rollback' }, 400);
    try {
      return c.json(rollbackJobOwner(db, parsed.data.auditId, parsed.data.operationId, getIdentity(c).userId));
    } catch (error) {
      return ownerError(error);
    }
  });
}

function ownerError(error: unknown): Response {
  const code = error instanceof Error ? error.message : '';
  const expected = ['owner_conflict', 'operation_conflict', 'evidence_mismatch', 'unknown_owner', 'migration_not_found'];
  return Response.json({ error: expected.includes(code) ? code : 'owner_migration_unavailable' }, {
    status: expected.includes(code) ? 409 : 503, headers: { 'cache-control': 'no-store' },
  });
}
