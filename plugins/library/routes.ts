// @implements SPEC-GLAB-LENDING-001
import { Hono, getUserSession } from '../../corpus/server/hub/sdk.ts';
import type { ServiceConnector, TokenProvider } from '../../corpus/server/hub/sdk.ts';
import { proxy } from '../shared.ts';

/** Bibliotheca remains the authorization authority for inventory mutations. */
export function libraryRoutes(connector: ServiceConnector, tokens: TokenProvider): Hono {
  const router = new Hono();
  router.use('*', async (c, next) => {
    c.header('cache-control', 'private, no-store');
    if (!getUserSession(c)) return c.json({ error: 'unauthorized' }, 401);
    await next();
  });
  router.get('/equipment', c => proxy(c, connector, '/api/integrations/glab/items/equipment', tokens, 'bibliotheca'));
  router.get('/books', c => proxy(c, connector, '/api/integrations/glab/items/books', tokens, 'bibliotheca'));
  router.get('/me', c => proxy(c, connector, '/api/integrations/glab/me', tokens, 'bibliotheca'));
  router.post('/books', c => proxy(c, connector, '/api/integrations/glab/items/books', tokens, 'bibliotheca'));
  router.get('/lookup', c => proxy(c, connector, '/api/integrations/glab/items/lookup', tokens, 'bibliotheca'));
  router.get('/loans/mine', c => proxy(c, connector, '/api/integrations/glab/loans/mine', tokens, 'bibliotheca'));
  router.post('/loans', c => proxy(c, connector, '/api/integrations/glab/loans', tokens, 'bibliotheca'));
  return router;
}
