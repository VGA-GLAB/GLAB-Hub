// ダッシュボードのパネル。 自分のプロフィールと最近のアクティビティを表示する。
//
// 編集導線は持たない (プロフィールの編集は 「プロフィール」 パネルの責務)。

import {
  el,
  ensureStyles,
  fmtDateTime,
  requireVantanUserRegistration,
  section,
  type PanelContext,
} from '../panel-kit.ts';

type ActivityKind =
  | 'attendance'
  | 'tech-link'
  | 'tech-link-comment'
  | 'forum-thread'
  | 'forum-comment'
  | 'consult'
  | 'project-join';

interface ActivityEntry {
  kind: ActivityKind;
  title: string;
  at: number;
  detail: string | null;
}

interface Summary {
  identity: { userId: string; displayName: string | null };
  profile: { name: string; roleTitle: string; departmentName: string } | null;
  profileComplete: boolean;
  profileError: string | null;
  roles: { key: string; label: string }[];
  stats: {
    attendanceDays30: number;
    projects: number;
    techLinks: number;
    forumPosts: number;
  };
  statsWindowDays: number;
  activity: ActivityEntry[];
}

/** 種別ごとの見出し。 サーバは種別と対象名しか返さないので、 文言はここが持つ。 */
const ACTIVITY_LABEL: Record<ActivityKind, { icon: string; verb: string }> = {
  attendance: { icon: '🚪', verb: 'に出席しました' },
  'tech-link': { icon: '🔗', verb: ' を共有しました' },
  'tech-link-comment': { icon: '💬', verb: ' にコメントしました' },
  'forum-thread': { icon: '📌', verb: ' を投稿しました' },
  'forum-comment': { icon: '💬', verb: ' に返信しました' },
  consult: { icon: '🙋', verb: ' で相談しました' },
  'project-join': { icon: '🎮', verb: ' に参加しました' },
};

/** 出席の打刻元。 生の値 (passkey / manual) は画面に出さない。 */
const ATTENDANCE_SOURCE: Record<string, string> = {
  passkey: 'パスキー',
  manual: '手動登録',
};

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  ensureDashboardStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  container.innerHTML = '';
  container.appendChild(el('h2', undefined, '🏠 ダッシュボード'));
  const loading = el('p', 'gl-muted', '読み込み中…');
  container.appendChild(loading);

  const summary = await loadSummary(ctx);
  loading.remove();
  if (!summary) {
    container.appendChild(el('p', 'gl-notice gl-notice-error', 'ダッシュボードを取得できませんでした。'));
    return;
  }

  container.appendChild(renderProfile(summary));
  container.appendChild(renderStats(summary));
  container.appendChild(renderActivity(summary.activity));
}

async function loadSummary(ctx: PanelContext): Promise<Summary | null> {
  try {
    const response = await ctx.api('/summary');
    if (!response.ok) return null;
    return await response.json() as Summary;
  } catch {
    return null;
  }
}

function renderProfile(summary: Summary): HTMLElement {
  const { wrap, body } = section('プロフィール');
  const card = el('div', 'gl-notice gl-dash-profile');

  const displayName = summary.profile?.name
    || summary.identity.displayName
    || summary.identity.userId;
  card.appendChild(el('div', 'gl-dash-name', displayName));

  if (summary.profile) {
    const meta = [summary.profile.departmentName, summary.profile.roleTitle]
      .filter((v) => v.length > 0)
      .join(' / ');
    card.appendChild(el('div', 'gl-muted', meta || '(学科・役職が未登録)'));
  } else {
    card.appendChild(el(
      'div',
      'gl-muted',
      summary.profileError === 'cernere_unavailable'
        ? 'プロフィールを取得できませんでした (認証サービスに接続できません)'
        : 'プロフィールを取得できませんでした',
    ));
  }

  if (summary.roles.length > 0) {
    const roles = el('div', 'gl-row gl-dash-roles');
    for (const role of summary.roles) {
      roles.appendChild(el('span', 'gl-tag', role.label));
    }
    card.appendChild(roles);
  }

  body.appendChild(card);
  return wrap;
}

function renderStats(summary: Summary): HTMLElement {
  const { wrap, body } = section('わたしの記録');
  const grid = el('div', 'gl-dash-stats');
  const cells: [string, number][] = [
    [`直近 ${summary.statsWindowDays} 日の出席`, summary.stats.attendanceDays30],
    ['参加プロジェクト', summary.stats.projects],
    ['共有した技術リンク', summary.stats.techLinks],
    ['フォーラム投稿', summary.stats.forumPosts],
  ];
  for (const [label, value] of cells) {
    const cell = el('div', 'gl-notice gl-dash-stat');
    cell.appendChild(el('div', 'gl-dash-stat-value', String(value)));
    cell.appendChild(el('div', 'gl-muted', label));
    grid.appendChild(cell);
  }
  body.appendChild(grid);
  return wrap;
}

function renderActivity(activity: ActivityEntry[]): HTMLElement {
  const { wrap, body } = section('最近のアクティビティ');
  if (activity.length === 0) {
    body.appendChild(el('p', 'gl-muted', 'まだ記録がありません。'));
    return wrap;
  }
  const list = el('ul', 'gl-list');
  for (const entry of activity) {
    const label = ACTIVITY_LABEL[entry.kind];
    const item = el('li');
    const line = el('div');
    line.appendChild(el('span', undefined, `${label.icon} `));
    line.appendChild(el('strong', undefined, entry.title));
    line.appendChild(el('span', undefined, label.verb));
    item.appendChild(line);
    item.appendChild(el('div', 'gl-muted gl-dash-when', activityMeta(entry)));
    list.appendChild(item);
  }
  body.appendChild(list);
  return wrap;
}

function activityMeta(entry: ActivityEntry): string {
  const when = fmtDateTime(entry.at);
  if (entry.kind === 'attendance' && entry.detail) {
    const source = ATTENDANCE_SOURCE[entry.detail];
    if (source) return `${when} · ${source}`;
  }
  return when;
}

let dashboardStylesInjected = false;

function ensureDashboardStyles(): void {
  if (dashboardStylesInjected) return;
  dashboardStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .gl-dash-profile { display: grid; gap: 0.4rem; }
    .gl-dash-name { font-size: 1.3rem; font-weight: 700; }
    .gl-dash-roles { margin-top: 0.2rem; }
    .gl-dash-stats {
      display: grid; gap: 0.8rem;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    }
    .gl-dash-stat { text-align: center; }
    .gl-dash-stat-value { font-size: 1.6rem; font-weight: 700; }
    .gl-dash-when { font-size: 0.8rem; }
  `;
  document.head.appendChild(style);
}
