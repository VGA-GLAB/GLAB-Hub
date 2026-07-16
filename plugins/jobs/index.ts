// GLAB モジュール 4: 就活 (jobs)。
//
// 2 系統のデータを扱う:
// - 求人情報 (glab_job、自前 SQLite): 投稿 / 検索 / クローズ。Discord Bot の /job と
//   同じ DB を共有し、締切が近い求人は Bot が #job へリマインドする (DESIGN.md §4)。
// - 本人の就活データ (`/career`): Cernere `tirocinium_student_career` が正本。

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
import { createCernereProjectClient } from '../cernere/create-client.ts';
import { getStudentCareer, setStudentCareer } from './student-career-client.ts';
import { studentCareerPatchSchema } from './student-career-schema.ts';

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

function makeJobRoutes(r: Hono, db: CorpusDb): void {
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
}

function makeCareerRoutes(r: Hono, ctx: CorpusContext): void {
  const client = createCernereProjectClient(ctx);

  r.get('/career', async (c) => {
    try {
      return c.json({ career: await getStudentCareer(client, getIdentity(c).userId) });
    } catch (error) {
      ctx.logger.error(`student career read failed: ${errorMessage(error)}`);
      return c.json({ error: 'cernere_unavailable' }, 503);
    }
  });

  r.put('/career', async (c) => {
    const parsed = studentCareerPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_student_career' }, 400);
    try {
      await setStudentCareer(client, getIdentity(c).userId, parsed.data);
      return c.json({ ok: true });
    } catch (error) {
      ctx.logger.error(`student career write failed: ${errorMessage(error)}`);
      return c.json({ error: 'cernere_unavailable' }, 503);
    }
  });
}

const jobsModule: CorpusModule = {
  id: 'jobs',
  title: '就活',
  icon: '💼',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const routes = new Hono();
    makeCareerRoutes(routes, ctx);
    makeJobRoutes(routes, ctx.db);
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: '就活', icon: '💼' });
    ctx.logger.info('jobs ready (glab_job shared with Discord bot + career → Cernere)');
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default jobsModule;
