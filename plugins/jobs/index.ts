// GLAB モジュール 4: 就活情報 (jobs)。
//
// 自前データ。 GLAB メンバーが就活情報 (企業 / 募集 / 締切 / URL) を投稿・共有する。
// 投稿は Discord Bot (bot/) の /job からも行え、 締切が近い求人は Bot が #job へ
// リマインドする (同じ DB を共有、 DESIGN.md §4)。 スキーマ / クエリは data.ts に集約。

import { Hono, getIdentity, cacheDisplayName } from '../../corpus/server/hub/sdk.ts';
import type { CorpusModule, CorpusContext, CorpusDb } from '../../corpus/server/hub/sdk.ts';
import {
  ensureSchema,
  createJob,
  listJobs,
  getJob,
  closeJob,
  type JobRow,
  type JobQuery,
} from '../data.ts';

function jobView(row: JobRow): Record<string, unknown> {
  return {
    id: row.id,
    company: row.company,
    position: row.position,
    category: row.category,
    url: row.url,
    body: row.body,
    deadlineAt: row.deadline_at,
    status: row.status,
    postedBy: row.posted_by,
    createdAt: row.created_at,
  };
}

function makeRoutes(db: CorpusDb): Hono {
  const r = new Hono();

  // 求人一覧 (?status=open|closed|all、 ?category=、 ?q=)
  r.get('/', (c) => {
    const statusParam = c.req.query('status');
    const status: JobQuery['status'] =
      statusParam === 'closed' || statusParam === 'all' ? statusParam : 'open';
    const query: JobQuery = { status };
    const category = c.req.query('category');
    if (category) query.category = category;
    const q = c.req.query('q');
    if (q) query.q = q;
    return c.json({ jobs: listJobs(db, query).map(jobView) });
  });

  // 求人投稿 (認証ユーザなら誰でも)
  r.post('/', async (c) => {
    const id = getIdentity(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      company?: string;
      position?: string;
      category?: string;
      url?: string;
      body?: string;
      deadlineAt?: number | string;
    };
    const company = (body.company ?? '').trim();
    if (!company) return c.json({ error: 'company_required' }, 422);
    let deadlineAt: number | null = null;
    if (body.deadlineAt != null && body.deadlineAt !== '') {
      const parsed =
        typeof body.deadlineAt === 'string' ? Date.parse(body.deadlineAt) : Number(body.deadlineAt);
      if (Number.isFinite(parsed)) deadlineAt = parsed;
    }
    const jobId = createJob(db, {
      company,
      position: (body.position ?? '').trim() || null,
      category: (body.category ?? '').trim() || null,
      url: (body.url ?? '').trim() || null,
      body: (body.body ?? '').trim() || null,
      deadlineAt,
      postedBy: id.userId,
    });
    if (id.displayName) cacheDisplayName(db, id.userId, id.displayName);
    const created = getJob(db, jobId);
    return c.json({ ok: true, job: created ? jobView(created) : null });
  });

  // クローズ (投稿者 or admin)
  r.post('/:id/close', (c) => {
    const id = getIdentity(c);
    const jobId = Number(c.req.param('id'));
    const job = getJob(db, jobId);
    if (!job) return c.json({ error: 'not_found' }, 404);
    if (job.posted_by !== id.userId && !id.isAdmin) {
      return c.json({ error: 'forbidden' }, 403);
    }
    closeJob(db, jobId);
    return c.json({ ok: true });
  });

  return r;
}

const jobsModule: CorpusModule = {
  id: 'jobs',
  title: '就活',
  icon: '💼',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    ctx.registerRoute(makeRoutes(ctx.db));
    ctx.registerPanel({ title: '就活', icon: '💼' });
    ctx.logger.info('jobs ready (own data, shared with Discord bot)');
  },
};

export default jobsModule;
