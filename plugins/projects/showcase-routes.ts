import { z } from 'zod';
import { getDisplayName, getIdentity, getUserToken, requireAdmin, type Hono, type CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { registerShowcaseDownloads } from './showcase-download-routes.ts';
import { getProject } from '../data.ts';
import { isWorkMember, linkedAuthors, listShowcaseRows, saveShowcase, setWorkProfile, workDownloads } from './showcase-store.ts';

const settings = z.object({
  introduction: z.string().trim().max(2000),
  graduationYear: z.number().int().min(2000).max(2100).nullable(),
  published: z.boolean(),
}).strict();
const profileInput = z.object({ featured: z.boolean() }).strict();

/** @implements SPEC-GLAB-WORK-SHOWCASE-001 */
export function registerShowcaseRoutes(router: Hono, ctx: CorpusContext): void {
  const db = ctx.db;
  router.use('/showcase/*', async (c, next) => {
    c.header('cache-control', 'private, no-store');
    if (!getUserToken(c)) return c.json({ error: 'user_login_required' }, 401);
    await next();
  });
  registerShowcaseDownloads(router, ctx);
  router.get('/showcase/works', c => {
    const author = c.req.query('author');
    const works = listShowcaseRows(db).filter(row => row.published === 1).flatMap(row => {
      const downloads = workDownloads(db, row.project_id);
      const authors = linkedAuthors(db, row.project_id);
      if (!downloads.length || (author && !authors.includes(author))) return [];
      return [{ id: row.project_id, name: row.name, introduction: row.introduction,
        graduationYear: row.graduation_year, downloads,
        authors: authors.map(userId => ({ userId, displayName: getDisplayName(db, userId) ?? '制作者' })) }];
    });
    return c.json({ works });
  });
  router.get('/showcase/manage', requireAdmin, c => c.json({ projects: listShowcaseRows(db) }));
  router.put('/showcase/manage/:id', requireAdmin, async c => {
    const parsed = settings.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_showcase' }, 400);
    const id = c.req.param('id');
    if (!getProject(db, id)) return c.json({ error: 'not_found' }, 404);
    if (parsed.data.published && !workDownloads(db, id).length) return c.json({ error: 'exe_required' }, 409);
    saveShowcase(db, id, parsed.data);
    return c.json({ ok: true });
  });
  router.get('/showcase/mine', c => {
    const userId = getIdentity(c).userId;
    return c.json({ works: listShowcaseRows(db).filter(row => isWorkMember(db, row.project_id, userId))
      .map(row => ({ id: row.project_id, name: row.name, published: row.published === 1,
        featured: linkedAuthors(db, row.project_id).includes(userId) })) });
  });
  router.put('/showcase/mine/:id', async c => {
    const parsed = profileInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_profile_link' }, 400);
    const userId = getIdentity(c).userId;
    const id = c.req.param('id');
    if (parsed.data.featured && !isWorkMember(db, id, userId)) return c.json({ error: 'not_project_member' }, 403);
    setWorkProfile(db, id, userId, parsed.data.featured);
    return c.json({ ok: true });
  });
}
