import { Hono, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { createCernereProjectClient } from '../cernere/create-client.ts';
import { getVantanUserProfile } from './profile-client.ts';
import {
  isCompleteVantanUserProfile,
} from './profile-schema.ts';
import { ensureGlabUser, ensureSchema } from '../data.ts';
import { registerSteamProfileRoutes } from './steam-profile-routes.ts';
import { registrationInputSchema, saveRegistration } from './registration.ts';
import { registerFacePhotoRoutes } from './face-photo-routes.ts';
import { registerPublicNameRoutes } from './public-name-routes.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { normalizeHttpBaseUrl } from '../shared.ts';

const vantanUserModule: CorpusModule = {
  id: 'vantan-user',
  title: '個人データ',
  icon: '👤',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    ctx.registerConnector(new VersionedHttpServiceConnector({
      id: 'cernere',
      title: '認証 (Cernere / Cr)',
      scope: 'multi',
      baseUrl: ctx.env('CERNERE_BASE_URL') ?? '',
      healthPath: '/health',
    }));
    const client = createCernereProjectClient(ctx);
    const router = new Hono();
    const cernereWebUrl = normalizeHttpBaseUrl(ctx.env('CERNERE_WEB_URL'), 'CERNERE_WEB_URL');
    router.get('/cernere-link', (c) => cernereWebUrl
      ? c.json({ url: cernereWebUrl }, 200, { 'cache-control': 'private, no-store' })
      : c.json({ error: 'link_unavailable' }, 503, { 'cache-control': 'private, no-store' }));
    router.use('/profile', async (c, next) => {
      c.header('cache-control', 'private, no-store');
      await next();
    });

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
      const parsed = registrationInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({
          error: 'invalid_profile',
          fields: parsed.error.flatten().fieldErrors,
        }, 400);
      }

      try {
        const identity = getIdentity(c);
        ensureGlabUser(ctx.db, identity.userId);
        await saveRegistration(client, identity.userId, parsed.data);
        const { steamProfile: _steamProfile, ...profile } = parsed.data;
        return c.json({ ok: true, profile });
      } catch (error) {
        ctx.logger.error('vantan_user registration write failed');
        return c.json({ error: 'cernere_unavailable' }, 503);
      }
    });

    registerFacePhotoRoutes(router, ctx);
    registerPublicNameRoutes(router, ctx, client);
    registerSteamProfileRoutes(router, ctx, client);

    ctx.registerRoute(router);
    ctx.registerPanel({ title: '個人データ', icon: '👤' });
    ctx.logger.info('vantan_user registration route enabled (Cernere project WS)');
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default vantanUserModule;
