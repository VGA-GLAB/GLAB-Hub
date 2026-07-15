import { Hono, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { createCernereProjectClient } from '../cernere/create-client.ts';
import { getVantanUserProfile, setVantanUserProfile } from './profile-client.ts';
import {
  isCompleteVantanUserProfile,
  vantanUserInputSchema,
} from './profile-schema.ts';
import { ensureGlabUser, ensureSchema } from '../data.ts';

const vantanUserModule: CorpusModule = {
  id: 'vantan-user',
  title: 'Vantan プロフィール',
  icon: '👤',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const client = createCernereProjectClient(ctx);
    const router = new Hono();

    router.get('/profile', async (c) => {
      const identity = getIdentity(c);
      ensureGlabUser(ctx.db, identity.userId);
      try {
        const profile = await getVantanUserProfile(client, identity.userId);
        return c.json({
          complete: isCompleteVantanUserProfile(profile),
          profile,
        });
      } catch (error) {
        ctx.logger.error(`vantan_user read failed: ${errorMessage(error)}`);
        return c.json({ error: 'cernere_unavailable' }, 503);
      }
    });

    router.put('/profile', async (c) => {
      const body = await c.req.json().catch(() => null);
      const parsed = vantanUserInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({
          error: 'invalid_profile',
          fields: parsed.error.flatten().fieldErrors,
        }, 400);
      }

      try {
        const identity = getIdentity(c);
        ensureGlabUser(ctx.db, identity.userId);
        await setVantanUserProfile(client, identity.userId, parsed.data);
        return c.json({ ok: true, profile: parsed.data });
      } catch (error) {
        ctx.logger.error(`vantan_user write failed: ${errorMessage(error)}`);
        return c.json({ error: 'cernere_unavailable' }, 503);
      }
    });

    ctx.registerRoute(router);
    ctx.registerPanel({ title: 'プロフィール', icon: '👤' });
    ctx.logger.info('vantan_user registration route enabled (Cernere project WS)');
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default vantanUserModule;
