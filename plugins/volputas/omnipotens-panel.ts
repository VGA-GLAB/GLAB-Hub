import { el, type PanelContext } from '../panel-kit.ts';
import {
  createAnalysisSummarySection,
  type AnalysisApiClient,
} from '../projects/analysis-summary-panel.ts';

interface ProjectOption {
  id: string;
  name: string;
}

function projectOptions(value: unknown): ProjectOption[] {
  if (!value || typeof value !== 'object') return [];
  const projects = (value as { projects?: unknown }).projects;
  if (!Array.isArray(projects)) return [];
  return projects.flatMap((project) => {
    if (!project || typeof project !== 'object') return [];
    const row = project as { id?: unknown; name?: unknown };
    return typeof row.id === 'string' && typeof row.name === 'string'
      ? [{ id: row.id, name: row.name }]
      : [];
  });
}

function projectsClient(ctx: PanelContext): AnalysisApiClient {
  return {
    api: (path, init) => ctx.hubApi(`/api/x/projects${path.startsWith('/') ? '' : '/'}${path}`, init),
  };
}

export async function createOmnipotensReviewSection(ctx: PanelContext): Promise<HTMLElement> {
  try {
    const response = await ctx.hubApi('/api/x/projects/projects');
    if (!response.ok) {
      return el('div', 'gl-notice gl-notice-error', `プロジェクト一覧を取得できませんでした (${response.status})。`);
    }
    const projects = projectOptions(await response.json());
    if (projects.length === 0) {
      return el('div', 'gl-notice', 'レビュー対象のプロジェクトが登録されていません。');
    }
    return createAnalysisSummarySection(projects, projectsClient(ctx));
  } catch {
    return el('div', 'gl-notice gl-notice-error', 'Omnipotensレビューへ接続できませんでした。');
  }
}
