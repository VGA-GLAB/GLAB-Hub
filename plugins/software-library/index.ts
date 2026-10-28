// @implements SPEC-GLAB-SOFTWARE-LIBRARY-001
import { Hono, getUserToken, requireAdmin, type CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { ensureSchema } from '../data.ts';
import { noStore } from '../shared.ts';
import { BodyTooLargeError, readBodyWithinLimit } from '../vantan-user/bounded-body.ts';
import { libraryId, libraryInput } from './schema.ts';
import { distributionUrl } from './distribution-url.ts';
import { listLibraries, saveLibrary } from './store.ts';

const softwareLibrary: CorpusModule = {
  id: 'software-library', title: 'ライブラリ取得', icon: '📦',
  setup(ctx) {
    ensureSchema(ctx.db);
    const routes = new Hono();
    routes.use('*', async (c, next) => {
      noStore(c);
      if (!getUserToken(c)) return c.json({ error: 'user_login_required' }, 401);
      await next();
    });
    routes.get('/entries', c => c.json({ entries: listLibraries(ctx.db, false) }));
    routes.get('/manage', requireAdmin, c => c.json({ entries: listLibraries(ctx.db, true) }));
    routes.put('/entries/:id', requireAdmin, async c => {
      const id = libraryId.safeParse(c.req.param('id'));
      if (!id.success) return c.json({ error: 'invalid_id' }, 400);
      if (!c.req.header('content-type')?.startsWith('application/json')) return c.json({ error: 'json_required' }, 415);
      let input: unknown;
      try {
        const bytes = await readBodyWithinLimit(c.req.raw, 16 * 1024);
        input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      } catch (error) {
        return c.json({ error: error instanceof BodyTooLargeError ? 'body_too_large' : 'invalid_json' },
          error instanceof BodyTooLargeError ? 413 : 400);
      }
      const parsed = libraryInput.safeParse(input);
      if (!parsed.success) return c.json({ error: 'invalid_library', message: '入力と配布先を確認してください。公開にはバージョン・ライセンス・HTTPSの取得先が必要です。' }, 400);
      const existing = listLibraries(ctx.db, true);
      if (!existing.some(entry => entry.id === id.data) && existing.length >= 200)
        return c.json({ error: 'catalog_full' }, 409);
      const downloadUrl = parsed.data.downloadUrl ? distributionUrl(parsed.data.downloadUrl) : '';
      if (downloadUrl === null) return c.json({ error: 'invalid_download_url' }, 400);
      const entry = { id: id.data, ...parsed.data,
        downloadUrl };
      saveLibrary(ctx.db, entry, new Date().toISOString());
      return c.json({ entry });
    });
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: 'ライブラリ取得', icon: '📦' });
  },
};
export default softwareLibrary;
