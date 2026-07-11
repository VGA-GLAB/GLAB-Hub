import { Hono, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { CernereProjectClient } from './cernere-client.ts';
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
    const client = new CernereProjectClient({
      cernereBaseUrl: requireEnv(ctx, 'CERNERE_BASE_URL'),
      clientId: requireEnv(ctx, 'CERNERE_PROJECT_CLIENT_ID'),
      clientSecret: requireEnv(ctx, 'CERNERE_PROJECT_CLIENT_SECRET'),
    });
    const router = new Hono();

    router.get('/profile', async (c) => {
      const identity = getIdentity(c);
      ensureGlabUser(ctx.db, identity.userId);
      try {
        const profile = await client.getVantanUserProfile(identity.userId);
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
        await client.setVantanUserProfile(identity.userId, parsed.data);
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

function requireEnv(ctx: CorpusContext, key: string): string {
  const value = ctx.env(key)?.trim();
  if (!value) throw new Error(`Required environment variable is missing: ${key}`);
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default vantanUserModule;
