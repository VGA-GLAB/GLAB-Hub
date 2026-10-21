import { getIdentity, getServicePrincipal } from '../../corpus/server/hub/sdk.ts';
import type { MiddlewareHandler } from '../../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../data.ts';
import { readAdmission, recordRegistration } from './store.ts';

let admissionDb: SqlDb | null = null;
export function configureAdmissionPolicy(db: SqlDb): void { admissionDb = db; }

/** @implements SPEC-GLAB-ADMISSION-001 */
export const memberAccessPolicy: MiddlewareHandler = async (c, next) => {
  // Service identities already pass Corpus's explicit external-module allowlist;
  // each external route retains its own service scope validation.
  if (getServicePrincipal(c)) return next();
  const identity = getIdentity(c);
  if (!admissionDb) return c.json({ error: 'admission_unavailable' }, 503);
  if (identity.isAdmin) return next();
  recordRegistration(admissionDb, identity.userId, Date.now());
  const admission = readAdmission(admissionDb, identity.userId);
  if (admission?.status === 'approved') return next();
  c.header('cache-control', 'private, no-store');
  if (c.req.method === 'GET') {
    if (['/api/me', '/api/x/access/self'].includes(c.req.path)) return next();
    if (c.req.path === '/api/hub/connectors') {
      await next();
      if (!c.res.ok) return;
      const result = await c.res.clone().json() as { connectors: Array<{ title: string; health: { status: string } }> };
      c.res = c.json({ connectors: result.connectors.map(connector => ({
        title: connector.title, health: { status: connector.health.status },
      })) });
      return;
    }
    if (c.req.path === '/api/hub/modules') return c.json({ modules: [] });
    if (c.req.path === '/api/hub/services') return c.json({ services: [] });
  }
  return c.json({ error: 'glab_approval_required', status: admission?.status ?? 'pending' }, 403);
};
