// progress パネルの描画。
//
// Calliope `GET /api/glab/progress` のレスポンス (Calliope src/sprint/progress.ts の
// GlabProjectProgress) を DOM に写すだけ。 判定も再計算もここではしない
// (health / risk / 停滞判定は Calliope が算出済みの値をそのまま出す)。

import { el, section } from '../panel-kit.ts';

export interface GoalProgress {
  source: string;
  status: string | null;
  observed: number;
  expected: number;
  lag: number;
}

export interface ProjectHealth {
  status: 'no_sprint' | 'complete' | 'on_track' | 'at_risk';
  projectedCompletion: string | null;
  scopeCreepRate: number;
  velocitySpread: number;
  goalProgress: GoalProgress | null;
}

export interface ProjectBurndown {
  committedMinutes: number;
  remainingMinutes: number;
  plannedRemainingMinutes: number;
  elapsedFraction: number;
}

export interface ProjectRisk {
  level: string;
  projectedCompletion: string | null;
  deadline: string | null;
  slackDaysP50: number | null;
  slackDaysP80: number | null;
}

export interface StalledTask {
  taskRef: string;
  sourceStatus: string;
  committedAt: string | null;
  stalledDays: number;
}

export interface ProjectSprint {
  id: string;
  status: string;
  periodStart: string;
  periodEnd: string;
}

export interface ProjectProgress {
  projectId: string;
  projectRef: string;
  projectName: string;
  sprint: ProjectSprint | null;
  health: ProjectHealth | null;
  burndown: ProjectBurndown | null;
  risk: ProjectRisk | null;
  stalledTasks?: StalledTask[];
  warnings?: string[];
}

export interface ProgressResponse {
  generatedAt: string;
  projects: ProjectProgress[];
}

const HEALTH_LABEL: Record<ProjectHealth['status'], string> = {
  no_sprint: 'スプリント無し',
  complete: '完了',
  on_track: '順調',
  at_risk: '遅延リスク',
};

const HEALTH_TAG_CLASS: Record<ProjectHealth['status'], string> = {
  no_sprint: '',
  complete: 'closed',
  on_track: 'closed',
  at_risk: 'soon',
};

/** 0..1 の比率を百分率表記にする。 */
function pct(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

/** 分数を整数表記にする。 pct と同じく非有限値は「—」に落とす。 */
function minutes(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value)}分` : '—';
}

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '未定';
}

function healthTag(health: ProjectHealth | null): HTMLElement {
  if (!health) return el('span', 'gl-tag', '不明');
  const label = HEALTH_LABEL[health.status] ?? health.status;
  const variant = HEALTH_TAG_CLASS[health.status] ?? '';
  return el('span', `gl-tag ${variant}`.trim(), label);
}

function headerRow(project: ProjectProgress): HTMLElement {
  const head = el('div', 'gl-row');
  head.appendChild(el('strong', undefined, project.projectName || project.projectRef));
  head.appendChild(healthTag(project.health));
  if (project.risk) head.appendChild(el('span', 'gl-tag', `risk: ${project.risk.level}`));
  return head;
}

function sprintLine(sprint: ProjectSprint | null): HTMLElement {
  if (!sprint) return el('p', 'gl-muted', 'スプリント未設定');
  return el(
    'p',
    'gl-muted',
    `スプリント ${sprint.status} (${day(sprint.periodStart)} 〜 ${day(sprint.periodEnd)})`,
  );
}

function burndownLine(burndown: ProjectBurndown): HTMLElement {
  return el(
    'p',
    undefined,
    `burndown: 残り ${minutes(burndown.remainingMinutes)} / 計画残り ${minutes(burndown.plannedRemainingMinutes)}`
    + ` (経過 ${pct(burndown.elapsedFraction)})`,
  );
}

function goalLine(goal: GoalProgress): HTMLElement {
  const status = goal.status ? `${goal.status} — ` : '';
  return el(
    'p',
    'gl-muted',
    `goal (${goal.source}): ${status}観測 ${pct(goal.observed)} / 期待 ${pct(goal.expected)}`
    + ` (乖離 ${pct(goal.lag)})`,
  );
}

function stalledSection(tasks: StalledTask[]): HTMLElement {
  const stalled = section(`停滞タスク (${tasks.length})`);
  const list = el('ul', 'gl-list');
  for (const task of tasks) {
    const item = el('li');
    item.appendChild(el('strong', undefined, task.taskRef));
    item.appendChild(
      el('span', 'gl-muted', `  ${task.sourceStatus} — ${Math.round(task.stalledDays)}日停滞`),
    );
    list.appendChild(item);
  }
  stalled.body.appendChild(list);
  return stalled.wrap;
}

/** PJ 1 件分のカード。 */
export function renderProject(project: ProjectProgress): HTMLElement {
  const card = el('div', 'gl-bubble');
  card.appendChild(headerRow(project));
  card.appendChild(sprintLine(project.sprint));
  if (project.burndown) card.appendChild(burndownLine(project.burndown));
  if (project.health?.goalProgress) card.appendChild(goalLine(project.health.goalProgress));

  const stalled = project.stalledTasks ?? [];
  if (stalled.length > 0) card.appendChild(stalledSection(stalled));

  const warnings = project.warnings ?? [];
  if (warnings.length > 0) card.appendChild(el('p', 'gl-muted', `⚠ ${warnings.join(' / ')}`));

  return card;
}

/** PJ 一覧セクション。 空でも「無い」と出す (無言で消さない)。 */
export function renderProjects(projects: ProjectProgress[]): HTMLElement {
  const list = section('プロジェクト進捗');
  if (projects.length === 0) {
    list.body.appendChild(el('p', 'gl-muted', '(進捗データがありません)'));
    return list.wrap;
  }
  for (const project of projects) list.body.appendChild(renderProject(project));
  return list.wrap;
}
