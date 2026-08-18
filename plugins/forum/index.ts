import { Hono, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { ensureSchema } from '../data.ts';
import { canSee, resolveRoles, parseAudience as audience } from '../roles/audience.ts';
import {
  deleteThread,
  findThread,
  insertComment,
  insertThread,
  listComments,
  listThreads,
  pinThread,
  type ForumThreadRow,
} from './store.ts';

const threadSchema = z.object({ title: z.string().min(1).max(160), body: z.string().min(1).max(8_000), audienceRoles: z.array(z.string().regex(/^[a-z][a-z0-9_-]{0,62}$/)).max(20).default([]) }).strict();
const commentSchema = z.object({ body: z.string().min(1).max(4_000) }).strict();

/** 役職は呼び出し側で 1 リクエスト 1 回だけ引く (一覧で行ごとに引かない)。 */
function visible(thread: ForumThreadRow, viewer: { userId: string; isAdmin: boolean }, roles: string[]): boolean {
  return canSee(audience(thread.audience_roles), roles, thread.created_by === viewer.userId, viewer.isAdmin);
}

function view(thread: ForumThreadRow): Record<string, unknown> {
  return { id: thread.id, title: thread.title, body: thread.body, audienceRoles: audience(thread.audience_roles) ?? [], pinned: Boolean(thread.pinned), createdBy: thread.created_by, createdAt: thread.created_at };
}

const forumModule: CorpusModule = {
  id: 'forum', title: 'フォーラム', icon: '💬',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const r = new Hono();
    r.post('/threads', async (c) => {
      const parsed = threadSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_thread' }, 400);
      const identity = getIdentity(c);
      const created = insertThread(ctx.db, {
        id: crypto.randomUUID(),
        title: parsed.data.title,
        body: parsed.data.body,
        audienceRolesJson: JSON.stringify(parsed.data.audienceRoles),
        createdBy: identity.userId,
        createdAt: Date.now(),
      });
      return c.json({ thread: view(created) }, 201);
    });
    r.get('/threads', (c) => {
      const identity = getIdentity(c);
      const q = c.req.query('q')?.trim();
      const role = c.req.query('role')?.trim();
      const rows = listThreads(ctx.db, q);
      const roles = resolveRoles(ctx.db, identity.userId);
      const threads = rows.filter((thread) => visible(thread, identity, roles))
        .filter((thread) => !role || (audience(thread.audience_roles) ?? []).includes(role)).map(view);
      return c.json({ threads });
    });
    r.get('/threads/:id', (c) => {
      const identity = getIdentity(c);
      const thread = findThread(ctx.db, c.req.param('id'));
      if (!thread || !visible(thread, identity, resolveRoles(ctx.db, identity.userId))) return c.json({ error: 'not_found' }, 404);
      return c.json({ thread: view(thread) });
    });
    r.delete('/threads/:id', (c) => {
      const identity = getIdentity(c);
      const thread = findThread(ctx.db, c.req.param('id'));
      if (!thread) return c.json({ error: 'not_found' }, 404);
      if (thread.created_by !== identity.userId && !identity.isAdmin) return c.json({ error: 'forbidden' }, 403);
      deleteThread(ctx.db, thread.id);
      return c.json({ ok: true });
    });
    r.post('/threads/:id/pin', (c) => {
      const identity = getIdentity(c);
      if (!identity.isAdmin) return c.json({ error: 'forbidden' }, 403);
      const changed = pinThread(ctx.db, c.req.param('id'));
      return changed ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
    });
    r.get('/threads/:id/comments', (c) => {
      const identity = getIdentity(c);
      const thread = findThread(ctx.db, c.req.param('id'));
      if (!thread || !visible(thread, identity, resolveRoles(ctx.db, identity.userId))) return c.json({ error: 'not_found' }, 404);
      const comments = listComments(ctx.db, thread.id);
      return c.json({ comments: comments.map((comment) => ({ id: comment.id, body: comment.body, createdBy: comment.created_by, createdAt: comment.created_at })) });
    });
    r.post('/threads/:id/comments', async (c) => {
      const parsed = commentSchema.safeParse(await c.req.json().catch(() => null));
      if (!parsed.success) return c.json({ error: 'invalid_comment' }, 400);
      const identity = getIdentity(c);
      const thread = findThread(ctx.db, c.req.param('id'));
      if (!thread || !visible(thread, identity, resolveRoles(ctx.db, identity.userId))) return c.json({ error: 'not_found' }, 404);
      const id = crypto.randomUUID();
      insertComment(ctx.db, { id, threadId: thread.id, body: parsed.data.body, createdBy: identity.userId, createdAt: Date.now() });
      return c.json({ ok: true, id }, 201);
    });
    ctx.registerRoute(r);
    ctx.registerPanel({ title: 'フォーラム', icon: '💬' });
  },
};

export default forumModule;
