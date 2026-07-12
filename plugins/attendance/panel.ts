// attendance パネル — GLAB が保持する user_id と現在の出席状況を表示・管理する。

import {
  el,
  fmtDateTime,
  section,
  ensureStyles,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';

type AttendanceStatus = 'unknown' | 'present' | 'absent' | 'late' | 'excused';

interface AttendanceUser {
  userId: string;
  status: AttendanceStatus;
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  unknown: '未設定',
  present: '出席',
  absent: '欠席',
  late: '遅刻',
  excused: '公欠',
};

const STATUSES = Object.keys(STATUS_LABELS) as AttendanceStatus[];

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '✅ 出席状況'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    const mineResponse = await ctx.api('/mine');
    if (!mineResponse.ok) {
      container.appendChild(errorNotice('自分の出席状況を取得できませんでした。'));
      return;
    }
    const mineBody = await mineResponse.json() as { user?: AttendanceUser };
    const mine = section('自分の現在状況');
    if (mineBody.user) {
      const u = mineBody.user;
      if (attendedToday(u)) {
        const badge = el('div', 'gl-notice');
        badge.style.borderColor = 'var(--green, #16a34a)';
        badge.style.color = 'var(--green, #16a34a)';
        badge.appendChild(el('strong', undefined, '本日出席済み ✅'));
        badge.appendChild(el('span', 'gl-muted', ` (${fmtDateTime(u.updatedAt)})`));
        mine.body.appendChild(badge);
      } else {
        const cta = el('div', 'gl-row');
        const btn = el('button', 'gl-btn', '本日の出席を記録');
        btn.onclick = () => {
          btn.disabled = true;
          void ctx.api('/mine/checkin', { method: 'POST' })
            .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return render(); })
            .catch(() => { btn.disabled = false; });
        };
        cta.appendChild(btn);
        cta.appendChild(el('span', 'gl-muted', '本日はまだ出席記録がありません。'));
        mine.body.appendChild(cta);
      }
      mine.body.appendChild(attendanceRow(u, false, ctx, render, ctx.identity.displayName));
    }
    container.appendChild(mine.wrap);

    if (ctx.identity.isAdmin) {
      const listResponse = await ctx.api('/list');
      const all = section('全メンバー（管理者）');
      if (!listResponse.ok) {
        all.body.appendChild(errorNotice('メンバー一覧を取得できませんでした。'));
      } else {
        const body = await listResponse.json() as { users?: AttendanceUser[] };
        const users = body.users ?? [];
        if (users.length === 0) {
          all.body.appendChild(el('p', 'gl-muted', '登録済みメンバーはいません。'));
        } else {
          const list = el('ul', 'gl-list');
          for (const user of users) list.appendChild(attendanceRow(user, true, ctx, render));
          all.body.appendChild(list);
        }
      }
      container.appendChild(all.wrap);
    }

    container.appendChild(el(
      'p',
      'gl-muted',
      'GLAB には Cernere user_id と現在の出席状況だけを保存します。名前・役職・学科は Cernere が正本です。',
    ));
  }

  await render();
}

/** 同一カレンダー日か (ローカル時刻)。 */
function isToday(ts: number): boolean {
  const d = new Date(ts);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** 本日出席済み = 出席/遅刻ステータスが今日更新されている。 */
function attendedToday(user: AttendanceUser): boolean {
  return (user.status === 'present' || user.status === 'late') && isToday(user.updatedAt);
}

function attendanceRow(
  user: AttendanceUser,
  editable: boolean,
  ctx: PanelContext,
  rerender: () => Promise<void>,
  label?: string | null,
): HTMLLIElement {
  const row = el('li');
  const main = el('div', 'gl-row');
  // 表示は氏名優先 (Cernere 正本)。 名前が無い場合のみ user_id を出す。
  main.appendChild(el('strong', undefined, label || user.userId));
  main.appendChild(el('span', `gl-tag ${user.status}`, STATUS_LABELS[user.status]));
  main.appendChild(el('span', 'gl-muted', `更新: ${fmtDateTime(user.updatedAt)}`));

  if (editable) {
    const select = el('select', 'gl-select');
    for (const status of STATUSES) {
      const option = el('option', undefined, STATUS_LABELS[status]);
      option.value = status;
      option.selected = status === user.status;
      select.appendChild(option);
    }
    select.onchange = () => {
      select.disabled = true;
      void ctx.api(`/${encodeURIComponent(user.userId)}/status`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: select.value }),
      }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return rerender();
      }).catch(() => {
        select.disabled = false;
      });
    };
    main.appendChild(select);
  }

  row.appendChild(main);
  return row;
}

function errorNotice(message: string): HTMLElement {
  const box = el('div', 'gl-notice gl-notice-error');
  box.appendChild(el('strong', undefined, message));
  return box;
}
