import { Hono, getIdentity, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema } from '../data.ts';
import { configureAdmissionPolicy } from './policy.ts';
import { decideAdmission, listAdmissions, readAdmission, recordRegistration } from './store.ts';
import { createCernereProjectClient } from '../cernere/create-client.ts';
import { requireExternalServiceAuth } from '../projects/service-auth.ts';
import { syncRegistrations } from './registration-sync.ts';
import { getVantanUserProfile } from '../vantan-user/profile-client.ts';

const decision = z.object({ status: z.enum(['approved', 'rejected']), revision: z.number().int().nonnegative() }).strict();
const module: CorpusModule = {
  id: 'access', title: '利用承認', icon: '🔐',
  setup(ctx) {
    ensureSchema(ctx.db);
    configureAdmissionPolicy(ctx.db);
    const client = createCernereProjectClient(ctx);
    const router = new Hono();
    router.use('*', async (c, next) => { c.header('cache-control', 'private, no-store'); await next(); });
    router.get('/self', c => {
      const identity = getIdentity(c);
      if (identity.isAdmin) return c.json({ status: 'approved', isAdmin: true });
      recordRegistration(ctx.db, identity.userId, Date.now());
      return c.json({ status: readAdmission(ctx.db, identity.userId)?.status ?? 'pending', isAdmin: false });
    });
    router.use('/requests', requireAdmin);
    router.use('/requests/*', requireAdmin);
    router.get('/requests', async c => {
      const requests = await Promise.all(listAdmissions(ctx.db).map(async row => {
        try { return { ...row, name: (await getVantanUserProfile(client, row.user_id)).name }; }
        catch { return { ...row, name: null }; /* Cr unavailable: retain the stable subject for review. */ }
      }));
      return c.json({ requests });
    });
    router.put('/requests/:userId', async c => {
      const parsed = decision.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_decision' }, 400);
      const changed = decideAdmission(ctx.db, c.req.param('userId'), parsed.data.status, parsed.data.revision, getIdentity(c).userId, Date.now());
      return changed ? c.json({ ok: true }) : c.json({ error: 'admission_changed_reload' }, 409);
    });
    const external = new Hono();
    external.use('*', requireExternalServiceAuth(ctx.env));
    external.post('/sync', async c => c.json({ imported: await syncRegistrations(ctx.db, client) }));
    router.route('/external', external);
    ctx.registerRoute(router);
    ctx.registerPanel({ title: '利用承認', icon: '🔐' });
  },
};
export default module;
