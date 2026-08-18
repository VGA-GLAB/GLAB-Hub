import { Hono, getDisplayName, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema } from '../data.ts';
import { requireServiceToken } from '../projects/service-auth.ts';
import { noStore, serviceToken } from '../shared.ts';
import {
  createLink,
  findLink,
  findSharedLink,
  insertLinkComment,
  listLinkComments,
  listLinks,
  listTagCounts,
  replaceTags,
  softDeleteLink,
  tagsFor,
  unshareLink,
  updateLink,
  type LinkRow,
} from './store.ts';

const tagSchema = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/);
const linkSchema = z.object({
  url: z.string().trim().url().max(2_000),
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(2_000).optional(),
  memo: z.string().trim().max(4_000).optional(),
  tags: z.array(tagSchema).max(20).optional(),
}).strict();
const patchSchema = linkSchema.omit({ url: true }).partial().strict();
const externalLinkSchema = linkSchema.extend({ sourceRef: z.string().trim().min(1).max(200) }).strict();
const commentSchema = z.object({ body: z.string().trim().min(1).max(4_000) }).strict();
const unshareSchema = z.object({ sourceRef: z.string().trim().min(1).max(200) }).strict();

function linkView(db: CorpusContext['db'], row: LinkRow): Record<string, unknown> {
  return {
    id: row.id, url: row.url, title: row.title, summary: row.summary, memo: row.memo,
    postedBy: row.posted_by, postedByName: getDisplayName(db, row.posted_by), source: row.source,
    sourceRef: row.source_ref, tags: tagsFor(db, row.id), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function canEdit(row: LinkRow, identity: { userId: string; isAdmin: boolean }): boolean {
  return row.posted_by === identity.userId || identity.isAdmin;
}

const techLinksModule: CorpusModule = {
  id: 'tech-links', title: '技術リンク', icon: '🔗',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const routes = new Hono();

    routes.get('/links', (c) => {
      noStore(c);
      const tag = c.req.query('tag')?.trim().toLowerCase();
      const q = c.req.query('q')?.trim();
      const limit = Math.min(Math.max(Number(c.req.query('limit') ?? 30) || 30, 1), 100);
      const offset = Math.max(Number(c.req.query('offset') ?? 0) || 0, 0);
      const links = listLinks(ctx.db, { tag, q, limit, offset });
      return c.json({ links: links.map((row) => linkView(ctx.db, row)), limit, offset });
    });

    routes.get('/links/:id', (c) => {
      noStore(c);
      const link = findLink(ctx.db, c.req.param('id'));
      return link ? c.json({ link: linkView(ctx.db, link) }) : c.json({ error: 'not_found' }, 404);
    });

    routes.post('/links', async (c) => {
      noStore(c);
      const parsed = linkSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_link' }, 400);
      const link = createLink(ctx.db, parsed.data, getIdentity(c).userId, 'web', null);
      if (!link) return c.json({ error: 'invalid_link' }, 400);
      return c.json({ link: linkView(ctx.db, link) }, 201);
    });

    routes.patch('/links/:id', async (c) => {
      noStore(c);
      const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_link' }, 400);
      const link = findLink(ctx.db, c.req.param('id'));
      if (!link) return c.json({ error: 'not_found' }, 404);
      if (!canEdit(link, getIdentity(c))) return c.json({ error: 'forbidden' }, 403);
      if (Object.keys(parsed.data).length === 0) return c.json({ error: 'empty_patch' }, 400);
      const data = parsed.data;
      updateLink(ctx.db, link, data);
      if (data.tags !== undefined) replaceTags(ctx.db, link.id, data.tags);
      return c.json({ link: linkView(ctx.db, findLink(ctx.db, link.id) as LinkRow) });
    });

    routes.delete('/links/:id', (c) => {
      noStore(c);
      const link = findLink(ctx.db, c.req.param('id'));
      if (!link) return c.json({ error: 'not_found' }, 404);
      if (!canEdit(link, getIdentity(c))) return c.json({ error: 'forbidden' }, 403);
      softDeleteLink(ctx.db, link.id);
      return c.json({ ok: true });
    });

    routes.get('/links/:id/comments', (c) => {
      noStore(c);
      if (!findLink(ctx.db, c.req.param('id'))) return c.json({ error: 'not_found' }, 404);
      const comments = listLinkComments(ctx.db, c.req.param('id')).map((comment) => ({
        id: comment.id, body: comment.body, userId: comment.user_id,
        displayName: getDisplayName(ctx.db, comment.user_id), createdAt: comment.created_at,
      }));
      return c.json({ comments });
    });

    routes.post('/links/:id/comments', async (c) => {
      noStore(c);
      const parsed = commentSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_comment' }, 400);
      if (!findLink(ctx.db, c.req.param('id'))) return c.json({ error: 'not_found' }, 404);
      const identity = getIdentity(c);
      const id = crypto.randomUUID();
      insertLinkComment(ctx.db, {
        id, linkId: c.req.param('id'), userId: identity.userId, body: parsed.data.body, createdAt: Date.now(),
      });
      return c.json({ ok: true, id }, 201);
    });

    routes.get('/tags', (c) => {
      noStore(c);
      return c.json({ tags: listTagCounts(ctx.db) });
    });

    routes.post('/external/links', requireServiceToken(serviceToken(ctx.env)), async (c) => {
      noStore(c);
      const parsed = externalLinkSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_link' }, 400);
      const identity = getIdentity(c);
      const existing = findSharedLink(ctx.db, parsed.data.sourceRef, identity.userId);
      if (existing) return c.json({ created: false, id: existing.id });
      const link = createLink(ctx.db, parsed.data, identity.userId, 'memoria', parsed.data.sourceRef);
      if (!link) return c.json({ error: 'invalid_link' }, 400);
      return c.json({ created: true, id: link.id }, 201);
    });

    routes.delete('/external/links', requireServiceToken(serviceToken(ctx.env)), async (c) => {
      noStore(c);
      const parsed = unshareSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_unshare' }, 400);
      const identity = getIdentity(c);
      const changed = unshareLink(ctx.db, parsed.data.sourceRef, identity.userId);
      return changed ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
    });

    ctx.registerRoute(routes);
    ctx.registerPanel({ title: '技術リンク', icon: '🔗' });
  },
};

export default techLinksModule;
