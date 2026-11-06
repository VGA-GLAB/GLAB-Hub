/** Current own-consent operations only. Biometric data remains at the facility.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import { getUserSession, type Hono, type CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { readBodyWithinLimit } from './bounded-body.ts';

const createInput = z.object({ facilityId: z.string().uuid(), policyVersion: z.string().trim().min(1).max(128) }).strict();
const facility = z.string().uuid();
export function registerFaceConsentRoutes(router: Hono, ctx: CorpusContext): void {
  router.get('/face-consent/policy', async c => {
    try {
      const base = new URL(ctx.env('CERNERE_BASE_URL') ?? '');
      if (base.username || base.password || base.search || base.hash || base.pathname !== '/'
        || !(base.protocol === 'https:' || (base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) throw new Error('Invalid Cr origin');
      const response = await fetch(new URL('/api/identity/face-consent/policy', base), {
        credentials: 'omit', redirect: 'error', signal: AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(6000)]),
      });
      if (!response.ok) { await response.body?.cancel(); throw new Error('Policy unavailable'); }
      const value = JSON.parse(new TextDecoder().decode(await readBodyWithinLimit(response, 64 * 1024))) as { version?: unknown; text?: unknown } | null;
      if (!value || typeof value.version !== 'string' || !value.version || typeof value.text !== 'string' || !value.text) throw new Error('Invalid policy');
      return c.json({ version: value.version, text: value.text });
    } catch { return c.json({ error: 'face_consent_policy_unavailable' }, 503); }
  });
  router.get('/face-consent/status', async c => {
    if (!ctx.identityProvider) return c.json({ error: 'identity_provider_unavailable' }, 503);
    try { return c.json({ items: await ctx.identityProvider.faceConsentStatus(getUserSession(c)) }); }
    catch { return c.json({ error: 'face_consent_unavailable' }, 503); }
  });
  router.post('/face-consent', async c => {
    const input = createInput.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: 'invalid_consent' }, 400);
    if (!ctx.identityProvider) return c.json({ error: 'identity_provider_unavailable' }, 503);
    try {
      await ctx.identityProvider.createFaceConsent(getUserSession(c), input.data.facilityId, input.data.policyVersion);
      return c.json({ ok: true });
    } catch { return c.json({ error: 'face_consent_unconfirmed', reloadBeforeRetry: true }, 503); }
  });
  router.delete('/face-consent', async c => {
    const facilityId = c.req.query('facilityId');
    if (facilityId !== undefined && !facility.safeParse(facilityId).success) return c.json({ error: 'invalid_facility' }, 400);
    if (!ctx.identityProvider) return c.json({ error: 'identity_provider_unavailable' }, 503);
    try {
      await ctx.identityProvider.revokeFaceConsent(getUserSession(c), facilityId);
      return c.json({ ok: true });
    } catch { return c.json({ error: 'face_consent_revocation_unconfirmed', reloadBeforeRetry: true }, 503); }
  });
}
