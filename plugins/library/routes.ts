// @implements SPEC-GLAB-LENDING-001
import { Hono, getUserToken } from '../../corpus/server/hub/sdk.ts';
import type { ServiceConnector, TokenProvider } from '../../corpus/server/hub/sdk.ts';
import { proxy } from '../shared.ts';

/** Bibliotheca remains the authorization authority for inventory mutations. */
export function libraryRoutes(connector: ServiceConnector, tokens: TokenProvider): Hono {
  const router = new Hono();
  router.use('*', async (c, next) => {
    c.header('cache-control', 'private, no-store');
    if (!getUserToken(c)) return c.json({ error: 'unauthorized' }, 401);
    await next();
  });
  router.get('/equipment', c => proxy(c, connector, '/api/items/equipment', tokens));
  router.get('/books', c => proxy(c, connector, '/api/items/books', tokens));
  router.get('/me', c => proxy(c, connector, '/api/me', tokens));
  router.post('/books', c => proxy(c, connector, '/api/items/books', tokens));
  router.post('/equipment', c => proxy(c, connector, '/api/items/equipment', tokens));
  router.get('/lookup', c => proxy(c, connector, '/api/items/lookup', tokens));
  router.get('/loans/mine', c => proxy(c, connector, '/api/loans/mine', tokens));
  router.post('/loans', c => proxy(c, connector, '/api/loans', tokens));
  return router;
}
