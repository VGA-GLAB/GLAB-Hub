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
    card.appendChild(statusControl(project, ctx, rerender));
    if (knownUsers) card.appendChild(memberAssignControl(project, ctx, rerender, knownUsers));
  }

  return card;
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
