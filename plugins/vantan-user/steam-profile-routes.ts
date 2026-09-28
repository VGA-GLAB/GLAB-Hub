import { getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { Hono, CorpusContext } from '../../corpus/server/hub/sdk.ts';
import type { CernereProjectApi } from '../cernere/shared-owner.ts';
import { getSteamProfile, setSteamProfile } from './steam-profile-client.ts';
import { steamProfileInputSchema } from './steam-profile-schema.ts';

const NO_STORE = { 'cache-control': 'private, no-store' } as const;

/** Corpus authenticates these routes; the body can never select another user. */
export function registerSteamProfileRoutes(
  router: Hono, ctx: CorpusContext, client: CernereProjectApi,
): void {
  router.get('/steam-profile', async (c) => {
    const userId = getIdentity(c).userId;
    try {
      return c.json({ profile: await getSteamProfile(client, userId) }, 200, NO_STORE);
    } catch {
      ctx.logger.error('Steam profile read failed');
      return c.json({ error: 'steam_profile_unavailable' }, 503, NO_STORE);
    }
  });
  router.put('/steam-profile', async (c) => {
    const userId = getIdentity(c).userId;
    const parsed = steamProfileInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_steam_profile' }, 400, NO_STORE);
    try {
      await setSteamProfile(client, userId, parsed.data);
      return c.json({ ok: true, profile: parsed.data }, 200, NO_STORE);
    } catch {
      // Upstream errors may include the private Steam ID; do not log them.
      ctx.logger.error('Steam profile write failed');
      return c.json({ error: 'steam_profile_unavailable' }, 503, NO_STORE);
    }
  });
}
