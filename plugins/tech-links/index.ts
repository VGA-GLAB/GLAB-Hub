import { Hono, getDisplayName, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema } from '../data.ts';
import { requireServiceToken } from '../projects/service-auth.ts';
import { noStore } from '../shared.ts';
import { normalizeLinkUrl } from './url.ts';

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

interface LinkRow {
  id: string; url: string; title: string; summary: string | null; memo: string | null;
  posted_by: string; source: 'web' | 'memoria'; source_ref: string | null;
  created_at: number; updated_at: number; deleted_at: number | null;
}

/** 検索語の LIKE メタ文字 (% _ \) を literal 化する (ESCAPE '\' 前提)。 */
function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

function tagsFor(db: CorpusContext['db'], linkId: string): string[] {
  return db.prepare('SELECT tag FROM glab_tech_link_tag WHERE link_id = ? ORDER BY tag ASC')
    .all(linkId).map((row) => (row as { tag: string }).tag);
}

function linkView(db: CorpusContext['db'], row: LinkRow): Record<string, unknown> {
  return {
    id: row.id, url: row.url, title: row.title, summary: row.summary, memo: row.memo,
    postedBy: row.posted_by, postedByName: getDisplayName(db, row.posted_by), source: row.source,
    sourceRef: row.source_ref, tags: tagsFor(db, row.id), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function replaceTags(db: CorpusContext['db'], linkId: string, tags: string[]): void {
  db.prepare('DELETE FROM glab_tech_link_tag WHERE link_id = ?').run(linkId);
  const insert = db.prepare('INSERT INTO glab_tech_link_tag (link_id, tag) VALUES (?, ?)');
  for (const tag of [...new Set(tags.map((value) => value.toLowerCase()))]) insert.run(linkId, tag);
}

function findLink(db: CorpusContext['db'], id: string): LinkRow | null {
  return (db.prepare('SELECT * FROM glab_tech_link WHERE id = ? AND deleted_at IS NULL').get(id) as LinkRow) ?? null;
}

/** URL を正規化して保存する。 正規化できない URL は null を返す (呼び出し側が 400)。 */
function createLink(
  db: CorpusContext['db'], input: z.infer<typeof linkSchema>, postedBy: string,
  source: 'web' | 'memoria', sourceRef: string | null,
): LinkRow | null {
  const normalizedUrl = normalizeLinkUrl(input.url);
  if (!normalizedUrl) return null;
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO glab_tech_link
    (id, url, title, summary, memo, posted_by, source, source_ref, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, normalizedUrl, input.title, input.summary ?? null, input.memo ?? null, postedBy, source, sourceRef, now, now);
  replaceTags(db, id, input.tags ?? []);
  return findLink(db, id) as LinkRow;
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
      const clauses = ['l.deleted_at IS NULL'];
      const params: unknown[] = [];
      if (tag) { clauses.push('EXISTS (SELECT 1 FROM glab_tech_link_tag t WHERE t.link_id = l.id AND t.tag = ?)'); params.push(tag); }
      if (q) {
        clauses.push(`(l.title LIKE ? ESCAPE '\\' OR l.summary LIKE ? ESCAPE '\\'
          OR l.memo LIKE ? ESCAPE '\\' OR l.url LIKE ? ESCAPE '\\')`);
        const pattern = likeContains(q);
        params.push(pattern, pattern, pattern, pattern);
      }
      const links = ctx.db.prepare(`SELECT l.* FROM glab_tech_link l WHERE ${clauses.join(' AND ')}
        ORDER BY l.created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as LinkRow[];
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
      ctx.db.prepare(`UPDATE glab_tech_link SET title = ?, summary = ?, memo = ?, updated_at = ? WHERE id = ?`)
        .run(data.title ?? link.title, data.summary === undefined ? link.summary : data.summary ?? null,
          data.memo === undefined ? link.memo : data.memo ?? null, Date.now(), link.id);
      if (data.tags !== undefined) replaceTags(ctx.db, link.id, data.tags);
      return c.json({ link: linkView(ctx.db, findLink(ctx.db, link.id) as LinkRow) });
    });

    routes.delete('/links/:id', (c) => {
      noStore(c);
      const link = findLink(ctx.db, c.req.param('id'));
      if (!link) return c.json({ error: 'not_found' }, 404);
      if (!canEdit(link, getIdentity(c))) return c.json({ error: 'forbidden' }, 403);
      const now = Date.now();
      ctx.db.prepare('UPDATE glab_tech_link SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
        .run(now, now, link.id);
      return c.json({ ok: true });
    });

    routes.get('/links/:id/comments', (c) => {
      noStore(c);
      if (!findLink(ctx.db, c.req.param('id'))) return c.json({ error: 'not_found' }, 404);
      const comments = ctx.db.prepare('SELECT * FROM glab_tech_link_comment WHERE link_id = ? ORDER BY created_at ASC')
        .all(c.req.param('id')).map((row) => {
          const comment = row as { id: string; user_id: string; body: string; created_at: number };
          return { id: comment.id, body: comment.body, userId: comment.user_id,
            displayName: getDisplayName(ctx.db, comment.user_id), createdAt: comment.created_at };
        });
      return c.json({ comments });
    });

    routes.post('/links/:id/comments', async (c) => {
      noStore(c);
      const parsed = commentSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_comment' }, 400);
      if (!findLink(ctx.db, c.req.param('id'))) return c.json({ error: 'not_found' }, 404);
      const identity = getIdentity(c);
      const id = crypto.randomUUID();
      ctx.db.prepare('INSERT INTO glab_tech_link_comment (id, link_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, c.req.param('id'), identity.userId, parsed.data.body, Date.now());
      return c.json({ ok: true, id }, 201);
    });

    routes.get('/tags', (c) => {
      noStore(c);
      const tags = ctx.db.prepare(`SELECT t.tag, COUNT(*) AS count FROM glab_tech_link_tag t
        JOIN glab_tech_link l ON l.id = t.link_id WHERE l.deleted_at IS NULL
        GROUP BY t.tag ORDER BY count DESC, t.tag ASC`).all();
      return c.json({ tags });
    });

    routes.post('/external/links', requireServiceToken(ctx.env('GLAB_PROJECTS_SERVICE_TOKEN')), async (c) => {
      noStore(c);
      const parsed = externalLinkSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_link' }, 400);
      const identity = getIdentity(c);
      const existing = ctx.db.prepare(`SELECT * FROM glab_tech_link
        WHERE source = 'memoria' AND source_ref = ? AND posted_by = ? AND deleted_at IS NULL`)
        .get(parsed.data.sourceRef, identity.userId) as LinkRow | undefined;
      if (existing) return c.json({ created: false, id: existing.id });
      const link = createLink(ctx.db, parsed.data, identity.userId, 'memoria', parsed.data.sourceRef);
      if (!link) return c.json({ error: 'invalid_link' }, 400);
      return c.json({ created: true, id: link.id }, 201);
    });

    routes.delete('/external/links', requireServiceToken(ctx.env('GLAB_PROJECTS_SERVICE_TOKEN')), async (c) => {
      noStore(c);
      const parsed = unshareSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_unshare' }, 400);
      const identity = getIdentity(c);
      const now = Date.now();
      const changed = ctx.db.prepare(`UPDATE glab_tech_link SET deleted_at = ?, updated_at = ?
        WHERE source = 'memoria' AND source_ref = ? AND posted_by = ? AND deleted_at IS NULL`)
        .run(now, now, parsed.data.sourceRef, identity.userId).changes;
      return changed ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
    });

    ctx.registerRoute(routes);
    ctx.registerPanel({ title: '技術リンク', icon: '🔗' });
  },
};

export default techLinksModule;
