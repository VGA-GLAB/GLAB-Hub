// GLAB モジュール: projects — 学生ゲーム制作 PJ レジストリ (正本)。
//
// Calliope docs/design/glab-pm.md §H2 の実装。 GLAB を「学生ゲーム制作プロジェクト」の
// 名簿・メンバー・リポ参照の正本として持つ。 Actio コア tasks.project_id はこの
// glab_project.id を不透明参照するだけで、 project マスタは Actio 側に複製しない
// (spec/tasks/2026-07-16-01-pm-task-source.md 最終裁定)。
//
// 個人属性 (氏名・学科等) は保持しない。 glab_project_member は Cernere user_id の
// 参照のみを持ち、 表示名は corpus/server/db.ts の display-name キャッシュ
// (他プラグインと共有) を別途引く。
//
// 認可:
//  - パネル (ブラウザ) 向け CRUD は Corpus の requireAuth (Cernere) 配下。
//    一覧/詳細の read は認証済みなら誰でも可、 登録・編集・メンバー割当は
//    requireAdmin (総合ディレクター相当。 既存 admin 判定機構を流用、 新設しない)。
//  - 外部サービス (Calliope) 向け read 専用ミラーは service token で追加認可する
//    (spec/interface/projects-registry.md)。 corpus/ の requireAuth は `/api/*`
//    全体に既にかかっており改変できないため、 実際の到達パスは
//    `/api/x/projects/external/projects` になる (設計文書の `/api/glab/projects`
//    という表記からの意図的な差異。 理由は同 md に明記)。

import { Hono, getDisplayName, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusDb, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import {
  PROJECT_MEMBER_ROLES,
  PROJECT_STATUSES,
  createProject,
  ensureSchema,
  getProject,
  getProjectWithMembers,
  listGlabUsers,
  listProjectsWithMembers,
  removeProjectMember,
  updateProject,
  upsertProjectMember,
  type ProjectMemberRow,
  type ProjectPatch,
  type ProjectRow,
  type ProjectWithMembers,
} from '../data.ts';
import { requireServiceToken } from './service-auth.ts';
import {
  AnalysisReportError,
  readAnalysisHtml,
  readAnalysisSummary,
} from './analysis-report-store.ts';

const projectInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4_000).optional(),
  repoUrl: z.string().trim().url().max(500).optional(),
}).strict();

const projectPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4_000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  repoUrl: z.string().trim().url().max(500).nullable().optional(),
}).strict();

const memberInputSchema = z.object({
  role: z.enum(PROJECT_MEMBER_ROLES),
}).strict();

function projectView(row: ProjectRow): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    repoUrl: row.repo_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function memberView(db: CorpusDb, row: ProjectMemberRow): Record<string, unknown> {
  return {
    userId: row.user_id,
    role: row.role,
    displayName: getDisplayName(db, row.user_id),
    createdAt: row.created_at,
  };
}

function projectWithMembersView(db: CorpusDb, row: ProjectWithMembers): Record<string, unknown> {
  return { ...projectView(row), members: row.members.map((m) => memberView(db, m)) };
}

/** patch 入力を既存行に merge した完全な ProjectPatch を作る (read-modify-write)。 */
function mergePatch(
  current: ProjectRow,
  patch: z.infer<typeof projectPatchSchema>,
): ProjectPatch {
  return {
    name: patch.name ?? current.name,
    description: patch.description === undefined ? current.description : patch.description,
    status: patch.status ?? current.status,
    repoUrl: patch.repoUrl === undefined ? current.repo_url : patch.repoUrl,
  };
}

function makePanelRoutes(r: Hono, ctx: CorpusContext): void {
  const db = ctx.db;
  const analysisRoot = ctx.env('GLAB_OMNIPOTENS_PROJECTS_ROOT');

  r.get('/projects', (c) => {
    const statusParam = c.req.query('status');
    const status = (PROJECT_STATUSES as readonly string[]).includes(statusParam ?? '')
      ? (statusParam as (typeof PROJECT_STATUSES)[number])
      : undefined;
    const projects = listProjectsWithMembers(db, status ? { status } : {});
    return c.json({ projects: projects.map((p) => projectWithMembersView(db, p)) });
  });

  r.get('/projects/:id', (c) => {
    const found = getProjectWithMembers(db, c.req.param('id'));
    if (!found) return c.json({ error: 'not_found' }, 404);
    return c.json({ project: projectWithMembersView(db, found) });
  });

  r.get('/projects/:id/analysis-summary', async (c) => {
    const project = getProject(db, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found' }, 404);
    try {
      const summary = await readAnalysisSummary(analysisRoot, project);
      const reportUrl = new URL(c.req.url);
      reportUrl.pathname = reportUrl.pathname.replace(/analysis-summary$/, 'analysis-files/omnipotens-final.html');
      return c.json({ summary, reportUrl: `${reportUrl.pathname}${reportUrl.search}` });
    } catch (error) {
      if (!(error instanceof AnalysisReportError)) throw error;
      const status = error.code === 'not_configured' ? 503 : error.code === 'not_found' ? 404 : 422;
      return c.json({ error: error.code, message: error.message }, status);
    }
  });

  r.get('/projects/:id/analysis-files/*', async (c) => {
    const project = getProject(db, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found' }, 404);
    try {
      const html = await readAnalysisHtml(analysisRoot, project, c.req.param('*') ?? '');
      c.header('content-type', 'text/html; charset=utf-8');
      c.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'");
      c.header('x-content-type-options', 'nosniff');
      return c.body(html);
    } catch (error) {
      if (!(error instanceof AnalysisReportError)) throw error;
      const status = error.code === 'not_configured' ? 503 : error.code === 'not_found' ? 404 : 422;
      return c.json({ error: error.code, message: error.message }, status);
    }
  });

  r.post('/projects', requireAdmin, async (c) => {
    const parsed = projectInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'invalid_project', fields: parsed.error.flatten().fieldErrors }, 400);
    }
    const created = createProject(db, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      repoUrl: parsed.data.repoUrl ?? null,
    });
    return c.json({ ok: true, project: projectWithMembersView(db, { ...created, members: [] }) });
  });

  r.patch('/projects/:id', requireAdmin, async (c) => {
    const parsed = projectPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'invalid_project', fields: parsed.error.flatten().fieldErrors }, 400);
    }
    const current = getProject(db, c.req.param('id'));
    if (!current) return c.json({ error: 'not_found' }, 404);
    const updated = updateProject(db, current.id, mergePatch(current, parsed.data));
    const found = updated ? getProjectWithMembers(db, updated.id) : null;
    if (!found) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true, project: projectWithMembersView(db, found) });
  });

  r.put('/projects/:id/members/:userId', requireAdmin, async (c) => {
    const parsed = memberInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: 'invalid_member', fields: parsed.error.flatten().fieldErrors }, 400);
    }
    const project = getProject(db, c.req.param('id'));
    if (!project) return c.json({ error: 'project_not_found' }, 404);
    const userId = c.req.param('userId').trim();
    if (!userId) return c.json({ error: 'user_id_required' }, 400);
    const member = upsertProjectMember(db, project.id, userId, parsed.data.role);
    return c.json({ ok: true, member: memberView(db, member) });
  });

  r.delete('/projects/:id/members/:userId', requireAdmin, (c) => {
    const removed = removeProjectMember(db, c.req.param('id'), c.req.param('userId'));
    if (!removed) return c.json({ error: 'not_found' }, 404);
    return c.json({ ok: true });
  });

  // メンバー割当 UI 用: 既に GLAB を利用したことのある Cernere user_id の一覧
  // (vantan-user / attendance と同じ「glab_user + 表示名キャッシュ」参照経路の流用。
  // 個人属性を新たに保持するものではない)。
  r.get('/known-users', requireAdmin, (c) => {
    const users = listGlabUsers(db).map((u) => ({
      userId: u.user_id,
      displayName: getDisplayName(db, u.user_id),
    }));
    return c.json({ users });
  });
}

function makeExternalRoutes(r: Hono, ctx: CorpusContext): void {
  const db = ctx.db;
  const guard = requireServiceToken(ctx.env('GLAB_PROJECTS_SERVICE_TOKEN'));

  r.get('/external/projects', guard, (c) => {
    const projects = listProjectsWithMembers(db);
    return c.json({ projects: projects.map((p) => projectWithMembersView(db, p)) });
  });

  r.get('/external/projects/:id', guard, (c) => {
    const found = getProjectWithMembers(db, c.req.param('id'));
    if (!found) return c.json({ error: 'not_found' }, 404);
    return c.json({ project: projectWithMembersView(db, found) });
  });
}

const projectsModule: CorpusModule = {
  id: 'projects',
  title: 'プロジェクト',
  icon: '🎮',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const routes = new Hono();
    makePanelRoutes(routes, ctx);
    makeExternalRoutes(routes, ctx);
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: 'プロジェクト', icon: '🎮' });
    ctx.logger.info(
      `projects ready (registry = GLAB 正本${ctx.env('GLAB_PROJECTS_SERVICE_TOKEN') ? '' : ' / 外部 read API は未設定 = 503'})`,
    );
  },
};

export default projectsModule;
