import { z } from 'zod';
import { getIdentity, type Hono, type CorpusContext } from '../../corpus/server/hub/sdk.ts';
import type { CernereProjectApi } from '../cernere/shared-owner.ts';

const input = z.object({ publicName: z.string().trim().min(1).max(200) }).strict();
const noStore = { 'cache-control': 'private, no-store' } as const;

/** Only the authenticated owner's common display name can be read or edited.
 * @implements SPEC-GLAB-PROFILE-EDIT-001
 */
export function registerPublicNameRoutes(router: Hono, ctx: CorpusContext, client: CernereProjectApi): void {
  router.get('/public-name', async (c) => {
    try {
      const raw = await client.call('profile', 'get', {
        userId: getIdentity(c).userId, fields: ['displayName'],
      });
      if (!raw || typeof raw !== 'object' || !('displayName' in raw)
        || typeof raw.displayName !== 'string') throw new Error('Invalid public name response');
      return c.json({ publicName: raw.displayName }, 200, noStore);
    } catch {
      ctx.logger.error('Public name read failed');
      return c.json({ error: 'public_name_unavailable' }, 503, noStore);
    }
  });
  router.put('/public-name', async (c) => {
    const parsed = input.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_public_name' }, 400, noStore);
    try {
      await client.call('profile', 'update', {
        userId: getIdentity(c).userId, displayName: parsed.data.publicName,
      });
      return c.json({ ok: true, publicName: parsed.data.publicName }, 200, noStore);
    } catch {
      ctx.logger.error('Public name write failed');
      return c.json({ error: 'public_name_unavailable' }, 503, noStore);
    }
  });
}
