import { getIdentity, type Hono, type CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import type { CernereProjectApi } from '../cernere/shared-owner.ts';
import type { MemberStatus } from '../data.ts';
import { noStore } from '../shared.ts';
import { getMemberLocation, setMemberLocation, LOCATIONS } from './location-client.ts';

const locationInput = z.object({ location: z.enum(LOCATIONS) }).strict();

/** Only the authenticated user's membership/location is exposed; the roster stays admin-only.
 * @implements SPEC-GLAB-SHELL-009
 */
export function registerHeaderRoutes(router: Hono, ctx: CorpusContext, client: CernereProjectApi): void {
  /** @implements SPEC-GLAB-SHELL-009 */
  router.get('/membership', (c) => {
    noStore(c);
    const row = ctx.db.prepare('SELECT status FROM glab_member WHERE user_id = ?')
      .get(getIdentity(c).userId) as { status: MemberStatus } | undefined;
    return c.json({ status: row?.status ?? null });
  });
  /** @implements SPEC-GLAB-SHELL-009 */
  router.get('/location', async (c) => {
    noStore(c);
    try {
      return c.json({ location: await getMemberLocation(client, getIdentity(c).userId) });
    } catch {
      ctx.logger.error('header location read failed');
      return c.json({ error: 'location_unavailable' }, 503);
    }
  });
  /** @implements SPEC-GLAB-SHELL-009 */
  router.put('/location', async (c) => {
    noStore(c);
    const parsed = locationInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_location' }, 400);
    try {
      await setMemberLocation(client, getIdentity(c).userId, parsed.data.location);
      return c.json({ location: parsed.data.location });
    } catch {
      ctx.logger.error('header location write failed');
      return c.json({ error: 'location_unavailable' }, 503);
    }
  });
}
