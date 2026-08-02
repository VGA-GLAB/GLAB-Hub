// projects パネル — 学生ゲーム制作 PJ 一覧 / 登録・編集 / メンバー割当。
//
// レジストリの正本はここ (GLAB)。 登録・編集・メンバー割当は運営者 (admin) のみ、
// 一覧の閲覧は認証済みなら誰でも可 (index.ts の認可参照)。

import {
  el,
  fmtDateTime,
  section,
  ensureStyles,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';
import { parseReviewList } from '../volputas/contracts.ts';
import { PROJECT_REVIEW_COMMENT_MAX, digestComment } from '../volputas/review-digest.ts';

type ProjectStatus = 'active' | 'paused' | 'closed';
type ProjectMemberRole = 'producer' | 'member';

interface ProjectMember {
  userId: string;
  role: ProjectMemberRole;
  displayName: string | null;
  createdAt: number;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  repoUrl: string | null;
  createdAt: number;
  updatedAt: number;
  members: ProjectMember[];
}

interface KnownUser {
  userId: string;
  displayName: string | null;
}

interface ReleaseAsset { name: string; size: number; browserDownloadUrl: string }
interface ProjectRelease { tag: string; name: string; publishedAt: string; assets: ReleaseAsset[] }
interface GitHubContributor { login: string; avatarUrl: string }

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: '進行中',
  paused: '休止',
  closed: '終了',
};
const STATUSES = Object.keys(STATUS_LABELS) as ProjectStatus[];

const ROLE_LABELS: Record<ProjectMemberRole, string> = {
  producer: 'プロデューサー',
  member: 'メンバー',
};
const ROLES = Object.keys(ROLE_LABELS) as ProjectMemberRole[];

/** カード内はダイジェスト表示なので件数を絞る (全件は volputas パネル側)。 */
const PROJECT_REVIEW_LIMIT = 3;

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '🎮 プロジェクト'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    if (ctx.identity.isAdmin) {
      container.appendChild(createProjectSection(ctx, render));
    }

    const listResponse = await ctx.api('/projects');
    const listSec = section('プロジェクト一覧');
    if (!listResponse.ok) {
      listSec.body.appendChild(errorNotice(`一覧を取得できませんでした (${listResponse.status})。`));
      container.appendChild(listSec.wrap);
      return;
    }
    const body = await listResponse.json() as { projects?: Project[] };
    const projects = body.projects ?? [];
    if (projects.length === 0) {
      listSec.body.appendChild(el('p', 'gl-muted', '登録されたプロジェクトはありません。'));
    } else {
      let knownUsers: KnownUser[] | null = null;
      if (ctx.identity.isAdmin) {
        const knownRes = await ctx.api('/known-users');
        if (knownRes.ok) {
          const knownBody = await knownRes.json() as { users?: KnownUser[] };
          knownUsers = knownBody.users ?? [];
        }
      }
      for (const project of projects) {
        listSec.body.appendChild(projectCard(project, ctx, render, knownUsers));
      }
    }
    container.appendChild(listSec.wrap);
  }

  await render();
}

function createProjectSection(ctx: PanelContext, rerender: () => Promise<void>): HTMLElement {
  const sec = section('新規登録');
  const name = el('input', 'gl-input') as HTMLInputElement;
  name.placeholder = 'プロジェクト名';
  const description = el('textarea', 'gl-textarea') as HTMLTextAreaElement;
  description.placeholder = '概要 (任意)';
  const repoUrl = el('input', 'gl-input') as HTMLInputElement;
  repoUrl.placeholder = 'リポジトリ URL (任意)';
  const submit = el('button', 'gl-btn', '登録');
  const message = el('p', 'gl-muted');

  submit.onclick = async () => {
    if (!name.value.trim()) {
      message.textContent = 'プロジェクト名を入力してください。';
      return;
    }
    submit.setAttribute('disabled', 'true');
    message.textContent = '登録中…';
    try {
      const res = await ctx.api('/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.value.trim(),
          description: description.value.trim() || undefined,
          repoUrl: repoUrl.value.trim() || undefined,
        }),
      });
      if (!res.ok) {
        message.textContent = `登録に失敗しました (${res.status})。`;
        return;
      }
      name.value = '';
      description.value = '';
      repoUrl.value = '';
      message.textContent = '';
      await rerender();
    } catch {
      message.textContent = '登録に失敗しました。';
    } finally {
      submit.removeAttribute('disabled');
    }
  };

  const row = el('div', 'gl-row');
  row.append(name, repoUrl, submit);
  sec.body.append(row, description, message);
  return sec.wrap;
}

function projectCard(
  project: Project,
  ctx: PanelContext,
  rerender: () => Promise<void>,
  knownUsers: KnownUser[] | null,
): HTMLElement {
  const card = el('li', 'gl-bubble');
  const head = el('div', 'gl-row');
  head.appendChild(el('strong', undefined, project.name));
  head.appendChild(el('span', `gl-tag ${project.status}`, STATUS_LABELS[project.status]));
  card.appendChild(head);

  if (project.description) {
    card.appendChild(el('p', undefined, project.description));
  }
  if (project.repoUrl) {
    const link = el('a', undefined, project.repoUrl) as HTMLAnchorElement;
    link.href = project.repoUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    card.appendChild(link);
  }
  const reviewLink = el('a', 'gl-btn ghost', 'Omnipotensレビューを見る') as HTMLAnchorElement;
  reviewLink.href = `/api/x/projects/projects/${encodeURIComponent(project.id)}/analysis-files/omnipotens-final.html`;
  reviewLink.target = '_blank';
  reviewLink.rel = 'noopener noreferrer';
  card.appendChild(reviewLink);
  const releases = releaseSection(project, ctx);
  card.appendChild(releases);
  card.appendChild(createReviewSection(project, ctx));
  card.appendChild(el('div', 'gl-muted', `登録: ${fmtDateTime(project.createdAt)}`));

  const memberList = el('ul', 'gl-list');
  if (project.members.length === 0) {
    memberList.appendChild(el('li', 'gl-muted', '(メンバー未割当)'));
  }
  for (const member of project.members) {
    const li = el('li');
    li.appendChild(el('span', undefined, member.displayName ?? member.userId));
    li.appendChild(el('span', 'gl-tag', ROLE_LABELS[member.role]));
    if (ctx.identity.isAdmin) {
      const remove = el('button', 'gl-btn ghost', '解除');
      remove.onclick = async () => {
        remove.setAttribute('disabled', 'true');
        const res = await ctx.api(
          `/projects/${encodeURIComponent(project.id)}/members/${encodeURIComponent(member.userId)}`,
          { method: 'DELETE' },
        );
        if (res.ok) await rerender();
        else remove.removeAttribute('disabled');
      };
      li.appendChild(remove);
    }
    memberList.appendChild(li);
  }
  card.appendChild(memberList);

  if (ctx.identity.isAdmin) {
    card.appendChild(githubSyncControl(project, ctx, releases));
    card.appendChild(statusControl(project, ctx, rerender));
    if (knownUsers) card.appendChild(memberAssignControl(project, ctx, rerender, knownUsers));
  }

  return card;
}

function releaseSection(project: Project, ctx: PanelContext): HTMLElement {
  const wrap = el('div', 'gl-muted', 'Release を読み込み中…');
  void (async () => {
    try {
      const response = await ctx.api(`/projects/${encodeURIComponent(project.id)}/releases`);
      if (!response.ok) { wrap.textContent = 'Release を取得できませんでした。'; return; }
      const body = await response.json() as { releases?: ProjectRelease[] };
      const latest = body.releases?.[0];
      if (!latest) { wrap.textContent = '公開済み Release はありません。'; return; }
      wrap.textContent = '';
      const recent = Date.now() - Date.parse(latest.publishedAt) < 7 * 24 * 60 * 60 * 1000;
      wrap.append(el('strong', undefined, `⬇ ${latest.name || latest.tag}`));
      if (recent) wrap.appendChild(el('span', 'gl-tag active', '新着あり'));
      const assets = el('div', 'gl-row');
      for (const asset of latest.assets ?? []) {
        const link = el('a', 'gl-btn ghost', asset.name) as HTMLAnchorElement;
        link.href = asset.browserDownloadUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        assets.appendChild(link);
      }
      wrap.append(assets, el('div', 'gl-muted', `公開: ${fmtDateTime(Date.parse(latest.publishedAt))}`));
    } catch {
      wrap.textContent = 'Release を取得できませんでした。';
    }
  })();
  return wrap;
}

function githubSyncControl(project: Project, ctx: PanelContext, releases: HTMLElement): HTMLElement {
  const row = el('div', 'gl-row');
  const sync = el('button', 'gl-btn ghost', 'GitHub 同期');
  const result = el('span', 'gl-muted');
  // 差し替えた要素を追い続けないと、 2 回目以降の同期が DOM から外れた古い節点を更新してしまう。
  let mounted = releases;
  if (!project.repoUrl) { sync.disabled = true; result.textContent = 'GitHub リポジトリ URL が未設定です。'; }
  sync.onclick = async () => {
    sync.disabled = true;
    result.textContent = '同期中…';
    try {
      const response = await ctx.api(`/projects/${encodeURIComponent(project.id)}/github-sync`, { method: 'POST' });
      if (!response.ok) { result.textContent = 'GitHub同期に失敗しました。'; return; }
      const body = await response.json() as { contributors?: GitHubContributor[] };
      result.textContent = '';
      const refreshed = releaseSection(project, ctx);
      mounted.replaceWith(refreshed);
      mounted = refreshed;
      const contributors = body.contributors ?? [];
      if (contributors.length) {
        result.textContent = '貢献者: ';
        for (const contributor of contributors) {
          const avatar = el('img') as HTMLImageElement;
          avatar.src = contributor.avatarUrl;
          avatar.alt = contributor.login;
          avatar.width = 20;
          avatar.height = 20;
          result.append(avatar, document.createTextNode(` ${contributor.login} `));
        }
      } else result.textContent = '同期しました。';
    } catch { result.textContent = 'GitHub同期に失敗しました。'; }
    finally { sync.disabled = false; }
  };
  row.append(sync, result);
  return row;
}

/** @implements SPEC-VOLPUTAS-REVIEWS-005 */
function createReviewSection(project: Project, ctx: PanelContext): HTMLElement {
  const wrap = el('section', 'gl-project-reviews');
  wrap.appendChild(el('h4', undefined, '感想'));
  const list = el('div', 'gl-muted', '感想を読み込み中…');
  // hub のタブ切り替えは query から復元されないので、 ここからレビュータブを
  // 「開く」ことはできない (`/?projectId=` へ遷移してもステータスタブに戻るだけ)。
  // 遷移でパネル状態を捨てず、 volputas パネルが mount 時に読む projectId だけを
  // その場で URL へ書き足し、 タブを開く案内を添える。
  const write = el('button', 'gl-btn ghost', '感想を書く');
  write.type = 'button';
  const hint = el('span', 'gl-muted');
  write.onclick = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('projectId', project.id);
    window.history.replaceState(null, '', url);
    hint.textContent = '「📝 レビュー」タブを開くと、このプロジェクトの感想が表示されます。';
  };
  const actions = el('div', 'gl-row');
  actions.append(write, hint);
  wrap.append(list, actions);
  void loadProjectReviews(ctx, project.id, list);
  return wrap;
}

/** @implements SPEC-VOLPUTAS-REVIEWS-005 */
async function loadProjectReviews(
  ctx: PanelContext,
  projectId: string,
  container: HTMLElement,
): Promise<void> {
  // volputas モジュールの proxy は /api/x/volputas に mount されるので hubApi で叩く。
  const response = await ctx.hubApi(
    `/api/x/volputas/reviews?projectId=${encodeURIComponent(projectId)}&limit=${PROJECT_REVIEW_LIMIT}`,
  ).catch(() => null);
  // Volputas 未設定時は connector が 503 を返す。 degraded は失敗ではないので未接続と伝える。
  if (response?.status === 503) {
    container.textContent = 'Volputas に未接続です。';
    return;
  }
  if (!response?.ok) {
    container.textContent = '感想を取得できませんでした。';
    return;
  }
  const reviews = parseReviewList(await response.json().catch(() => null));
  if (!reviews) {
    container.textContent = '感想を取得できませんでした。';
    return;
  }
  container.innerHTML = '';
  if (reviews.length === 0) {
    container.textContent = 'まだ感想はありません。';
    return;
  }
  for (const review of reviews) {
    const item = el('p');
    const comment = digestComment(review.comment, PROJECT_REVIEW_COMMENT_MAX);
    item.append(
      el('strong', undefined, review.gameTitle),
      document.createTextNode(` — ${comment}`),
    );
    container.appendChild(item);
  }
}

function statusControl(
  project: Project,
  ctx: PanelContext,
  rerender: () => Promise<void>,
): HTMLElement {
  const row = el('div', 'gl-row');
  const select = el('select', 'gl-select') as HTMLSelectElement;
  for (const status of STATUSES) {
    const option = el('option', undefined, STATUS_LABELS[status]) as HTMLOptionElement;
    option.value = status;
    option.selected = status === project.status;
    select.appendChild(option);
  }
  select.onchange = async () => {
    select.disabled = true;
    const res = await ctx.api(`/projects/${encodeURIComponent(project.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: select.value }),
    });
    if (res.ok) await rerender();
    else select.disabled = false;
  };
  row.appendChild(el('span', 'gl-muted', '状態:'));
  row.appendChild(select);
  return row;
}

function memberAssignControl(
  project: Project,
  ctx: PanelContext,
  rerender: () => Promise<void>,
  knownUsers: KnownUser[],
): HTMLElement {
  const row = el('div', 'gl-row');
  const userSelect = el('select', 'gl-select') as HTMLSelectElement;
  const assigned = new Set(project.members.map((m) => m.userId));
  const candidates = knownUsers.filter((u) => !assigned.has(u.userId));
  if (candidates.length === 0) {
    row.appendChild(el('span', 'gl-muted', '割当可能な既知メンバーはいません。'));
    return row;
  }
  for (const user of candidates) {
    const option = el('option', undefined, user.displayName ?? user.userId) as HTMLOptionElement;
    option.value = user.userId;
    userSelect.appendChild(option);
  }
  const roleSelect = el('select', 'gl-select') as HTMLSelectElement;
  for (const role of ROLES) {
    const option = el('option', undefined, ROLE_LABELS[role]) as HTMLOptionElement;
    option.value = role;
    roleSelect.appendChild(option);
  }
  const add = el('button', 'gl-btn ghost', 'メンバー追加');
  add.onclick = async () => {
    add.setAttribute('disabled', 'true');
    const res = await ctx.api(
      `/projects/${encodeURIComponent(project.id)}/members/${encodeURIComponent(userSelect.value)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: roleSelect.value }),
      },
    );
    if (res.ok) await rerender();
    else add.removeAttribute('disabled');
  };
  row.append(userSelect, roleSelect, add);
  return row;
}

function errorNotice(message: string): HTMLElement {
  const box = el('div', 'gl-notice gl-notice-error');
  box.appendChild(el('strong', undefined, message));
  return box;
}
