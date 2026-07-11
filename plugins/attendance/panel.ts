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
      mine.body.appendChild(attendanceRow(mineBody.user, false, ctx, render));
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

function attendanceRow(
  user: AttendanceUser,
  editable: boolean,
  ctx: PanelContext,
  rerender: () => Promise<void>,
): HTMLLIElement {
  const row = el('li');
  const main = el('div', 'gl-row');
  main.appendChild(el('strong', undefined, user.userId));
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
