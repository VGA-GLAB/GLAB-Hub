// @implements SPEC-GLAB-COCOIRU-DISTRIBUTION-001
import { Hono, type CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { readBodyWithinLimit } from '../vantan-user/bounded-body.ts';
import { listLibraries } from './store.ts';
import { libraryId } from './schema.ts';
import { readRelease } from './release-file.ts';
import { encryptRelease, recipientKey } from './encrypt-release.ts';

/** Parent middleware requires authenticated members; there is intentionally no native-client attestation. */
export function downloadRoutes(ctx: CorpusContext): Hono {
  const routes = new Hono();
  let active = 0;
  routes.post('/download/:id', async c => {
    const root = ctx.env('GLAB_LIBRARY_RELEASE_ROOT'), pin = ctx.env('GLAB_LIBRARY_CERT_SHA256');
    if (!root || !pin || !/^[a-f0-9]{64}$/.test(pin)) return c.json({ error: 'signed_distribution_not_configured' }, 503);
    if (active >= 2) return c.json({ error: 'download_busy' }, 429);
    const id = libraryId.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'invalid_id' }, 400);
    const entry = listLibraries(ctx.db, false).find(item => item.id === id.data);
    if (!entry) return c.json({ error: 'not_found' }, 404);
    if (!c.req.header('content-type')?.startsWith('application/json')) return c.json({ error: 'json_required' }, 415);
    active++;
    try {
      let nonce: string, key;
      try {
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 10_000);
        let raw: ArrayBuffer;
        try {
          const body = c.req.raw.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), { signal: controller.signal }) ?? null;
          raw = await readBodyWithinLimit({ body, headers: c.req.raw.headers }, 8192);
        } finally { clearTimeout(deadline); }
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
        if (!value || Object.keys(value).sort().join(',') !== 'nonce,publicKey'
          || typeof value.nonce !== 'string' || !/^[a-f0-9]{64}$/.test(value.nonce)
          || typeof value.publicKey !== 'string') throw new Error('Invalid request');
        nonce = value.nonce; key = recipientKey(value.publicKey);
      } catch { return c.json({ error: 'invalid_recipient' }, 400); }
      const raw = await readRelease(root, pin, entry);
      // Publication/withdrawal may have changed while reading the file.
      const current = listLibraries(ctx.db, false).find(item => item.id === entry.id);
      if (!current || current.version !== entry.version || current.sha256 !== entry.sha256) return c.json({ error: 'release_changed' }, 409);
      return c.json(encryptRelease(raw, key, nonce));
    } catch {
      ctx.logger.warn('software-library: signed release unavailable or invalid');
      return c.json({ error: 'signed_release_unavailable' }, 503);
    } finally { active--; }
  });
  return routes;
}
