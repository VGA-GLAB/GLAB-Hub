import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from '../../corpus/server/hub/sdk.ts';

const unavailable = '<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>文面準備中 | GLab</title><main><h1>文面準備中</h1><p>この文書はまだ公開されていません。</p><a href="/">GLab に戻る</a></main></html>';

/** Only operator-published static documents, never user-selected filesystem paths.
 * @implements SPEC-GLAB-PUBLIC-LEGAL-001
 */
export function createPublicLegalRoutes(directory: string): Hono {
  const router = new Hono();
  for (const document of ['privacy', 'terms'] as const) {
    router.get(`/legal/${document}`, c => {
      c.header('Cache-Control', 'no-store');
      c.header('Referrer-Policy', 'no-referrer');
      c.header('X-Content-Type-Options', 'nosniff');
      c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
      try {
        const html = readFileSync(resolve(directory, `${document}.html`), 'utf8');
        return c.html(html);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        // Missing approved copy must not masquerade as a published legal document.
        return c.html(unavailable, 503);
      }
    });
  }
  return router;
}
