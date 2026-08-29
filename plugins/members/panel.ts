// 部員名簿パネル — 管理者専用 (一般部員にはユーザー非公開)。
//
// 未登録部員は GLAB 保持の氏名、 登録済み部員は Cernere 正本の氏名を表示する。
// Discord は名前 (handle) で入力し、 数値 ID は bot が解決したものを表示する。

import { el, fmtDateTime, section, ensureStyles, type PanelContext } from '../panel-kit.ts';

type MemberStatus = 'active' | 'invited' | 'alumni' | 'suspended';

interface MemberView {
  id: string;
  userId: string | null;
  registered: boolean;
  name: string;
  discordHandle: string | null;
  discordUserId: string | null;
  status: MemberStatus;
  clubRole: string | null;
  joinedAt: number;
  updatedAt: number;
}

interface LinkCandidate {
  userId: string;
  name: string;
}

const STATUS_LABELS: Record<MemberStatus, string> = {
  active: '在籍',
  invited: '招待中',
  alumni: 'OB/OG',
  suspended: '休部',
};

const STATUSES = Object.keys(STATUS_LABELS) as MemberStatus[];

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();

  if (!ctx.identity.isAdmin) {
    container.innerHTML = '';
    const box = el('div', 'gl-notice');
    box.appendChild(el('strong', undefined, '部員名簿は管理者専用です。'));
    container.appendChild(box);
    return;
  }

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '📋 部員名簿 (管理者専用)'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    // ── 追加フォーム ──
    const add = section('部員を追加 (Cernere 未登録でも可)');
    const form = el('form', 'gl-row');
    const nameInput = input('氏名 *');
    const discordInput = input('Discord 名 (例: taro#1234 / taro)');
    const roleInput = input('係 (任意)');
    const submit = el('button', 'gl-btn', '追加');
    submit.type = 'submit';
    form.append(nameInput, discordInput, roleInput, submit);
    form.onsubmit = (ev) => {
      ev.preventDefault();
      if (!nameInput.value.trim()) return;
      submit.disabled = true;
      void ctx.api('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: nameInput.value.trim(),
          discordHandle: discordInput.value.trim() || undefined,
          clubRole: roleInput.value.trim() || undefined,
        }),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return render();
      }).catch(() => { submit.disabled = false; });
    };
    add.body.appendChild(form);
    container.appendChild(add.wrap);

    // ── 一覧 ──
    const listResponse = await ctx.api('/list');
    const roster = section('名簿');
    if (!listResponse.ok) {
      roster.body.appendChild(el('p', 'gl-muted', `一覧を取得できませんでした (HTTP ${listResponse.status})。`));
      container.appendChild(roster.wrap);
      return;
    }
    const { members } = await listResponse.json() as { members: MemberView[] };
    if (members.length === 0) {
      roster.body.appendChild(el('p', 'gl-muted', '部員はまだ登録されていません。'));
    } else {
      const candidates = await fetchCandidates(ctx);
      const list = el('ul', 'gl-list');
      for (const m of members) list.appendChild(memberRow(m, candidates, ctx, render));
      roster.body.appendChild(list);
    }
    container.appendChild(roster.wrap);

    container.appendChild(el(
      'p',
      'gl-muted',
      '氏名の正本は Cernere (vantan_user)。GLab が氏名を保持するのは未登録部員の間だけで、リンク時に破棄されます。Discord 数値 ID は bot が自動解決します。',
    ));
  }

  await render();
}

async function fetchCandidates(ctx: PanelContext): Promise<LinkCandidate[]> {
  try {
    const res = await ctx.api('/link-candidates');
    if (!res.ok) return [];
    const body = await res.json() as { candidates?: LinkCandidate[] };
    return body.candidates ?? [];
  } catch {
    return [];
  }
}

function memberRow(
  m: MemberView,
  candidates: LinkCandidate[],
  ctx: PanelContext,
  rerender: () => Promise<void>,
): HTMLLIElement {
  const row = el('li');
  const main = el('div', 'gl-row');

  main.appendChild(el('span', `gl-tag ${m.registered ? 'present' : 'unknown'}`, m.registered ? '登録済' : '未登録'));
  main.appendChild(el('strong', undefined, m.name));
  if (m.discordHandle) {
    const idNote = m.discordUserId ? ` (ID: ${m.discordUserId})` : ' (ID 未解決)';
    main.appendChild(el('span', 'gl-muted', `Discord: ${m.discordHandle}${idNote}`));
  }
  if (m.clubRole) main.appendChild(el('span', 'gl-muted', `係: ${m.clubRole}`));

  // status 変更
  const statusSelect = el('select', 'gl-select');
  for (const s of STATUSES) {
    const option = el('option', undefined, STATUS_LABELS[s]);
    option.value = s;
    option.selected = s === m.status;
    statusSelect.appendChild(option);
  }
  statusSelect.onchange = () => {
    statusSelect.disabled = true;
    void ctx.api(`/${encodeURIComponent(m.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: statusSelect.value }),
    }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return rerender(); })
      .catch(() => { statusSelect.disabled = false; });
  };
  main.appendChild(statusSelect);

  // 未登録 → Cernere ユーザへのリンク
  if (!m.registered && candidates.length > 0) {
    const linkSelect = el('select', 'gl-select');
    const placeholder = el('option', undefined, 'ユーザにリンク…');
    placeholder.value = '';
    linkSelect.appendChild(placeholder);
    for (const cand of candidates) {
      const option = el('option', undefined, `${cand.name} (${cand.userId.slice(0, 8)}…)`);
      option.value = cand.userId;
      linkSelect.appendChild(option);
    }
    linkSelect.onchange = () => {
      if (!linkSelect.value) return;
      linkSelect.disabled = true;
      void ctx.api(`/${encodeURIComponent(m.id)}/link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: linkSelect.value }),
      }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return rerender(); })
        .catch(() => { linkSelect.disabled = false; });
    };
    main.appendChild(linkSelect);
  }

  // 削除
  const del = el('button', 'gl-btn ghost', '削除');
  del.onclick = () => {
    if (!window.confirm(`「${m.name}」を名簿から削除しますか？`)) return;
    del.disabled = true;
    void ctx.api(`/${encodeURIComponent(m.id)}`, { method: 'DELETE' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return rerender(); })
      .catch(() => { del.disabled = false; });
  };
  main.appendChild(del);

  main.appendChild(el('span', 'gl-muted', `更新: ${fmtDateTime(m.updatedAt)}`));
  row.appendChild(main);
  return row;
}

function input(placeholder: string): HTMLInputElement {
  const node = el('input', 'gl-input');
  node.type = 'text';
  node.placeholder = placeholder;
  return node;
}
