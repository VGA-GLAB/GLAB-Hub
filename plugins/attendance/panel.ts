import { startAuthentication } from '@simplewebauthn/browser';
import {
  el,
  fmtDateTime,
  section,
  ensureStyles,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';
import { canReachLocalOstiarius } from './local-ostiarius.ts';

type AttendanceStatus = 'unknown' | 'present' | 'absent' | 'late' | 'excused';

interface AttendanceUser {
  userId: string;
  displayName: string | null;
  status: AttendanceStatus;
  eventTitle: string | null;
  checkedInAt: number | null;
  updatedAt: number;
}

interface ActiveEvent {
  id: number;
  title: string;
  startsAt: number;
  endsAt: number;
  facilityId: string | null;
}

interface Availability {
  enabled: boolean;
  event: ActiveEvent | null;
  ostiarius: {
    status: 'up' | 'degraded' | 'down';
    detail?: string;
    baseUrl: string | null;
  };
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
    head.appendChild(el('h2', undefined, '✅ 出席'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    const availabilityResponse = await ctx.api('/availability');
    if (!availabilityResponse.ok) {
      container.appendChild(errorNotice('出席可能状態を取得できませんでした。'));
      return;
    }
    const availability = await availabilityResponse.json() as Availability;
    const localOstiariusReachable = Boolean(
      availability.event
      && availability.ostiarius.baseUrl
      && await canReachLocalOstiarius(availability.ostiarius.baseUrl),
    );
    container.appendChild(checkinSection(availability, localOstiariusReachable, ctx, render));

    const mineResponse = await ctx.api('/mine');
    if (!mineResponse.ok) {
      container.appendChild(errorNotice('自分の出席状況を取得できませんでした。'));
      return;
    }
    const mineBody = await mineResponse.json() as { user?: AttendanceUser };
    const mine = section('自分の現在状況');
    if (mineBody.user) mine.body.appendChild(attendanceRow(mineBody.user, false, ctx, render));
    container.appendChild(mine.wrap);

    if (ctx.identity.isAdmin) {
      const listResponse = await ctx.api('/list');
      const all = section('全メンバー（管理者）');
      if (!listResponse.ok) {
        all.body.appendChild(errorNotice('メンバー一覧を取得できませんでした。'));
      } else {
        const body = await listResponse.json() as { users?: AttendanceUser[] };
        const users = body.users ?? [];
        const list = el('ul', 'gl-list');
        for (const user of users) list.appendChild(attendanceRow(user, true, ctx, render));
        all.body.appendChild(users.length > 0
          ? list
          : el('p', 'gl-muted', '登録済みメンバーはいません。'));
      }
      container.appendChild(all.wrap);
    }
  }

  await render();
}

function checkinSection(
  availability: Availability,
  localOstiariusReachable: boolean,
  ctx: PanelContext,
  rerender: () => Promise<void>,
): HTMLElement {
  const checkin = section('イベント出席');
  const message = el('p', 'gl-muted');

  if (!availability.event) {
    checkin.body.appendChild(el('strong', undefined, '進行中のイベントはありません'));
    message.textContent = 'イベントが始まると出席できます。';
  } else {
    checkin.body.appendChild(el('strong', undefined, availability.event.title));
    checkin.body.appendChild(el(
      'div',
      'gl-muted',
      `${fmtDateTime(availability.event.startsAt)}〜${fmtDateTime(availability.event.endsAt)}`,
    ));
    if (availability.ostiarius.status !== 'up' || !localOstiariusReachable) {
      message.textContent = '会場Wi-Fi内のOsに接続できないため、現在は出席できません。';
    }
  }

  if (!availability.enabled || !availability.ostiarius.baseUrl || !localOstiariusReachable) {
    checkin.body.appendChild(message);
    return checkin.wrap;
  }

  const button = el('button', 'gl-btn', '出席');
  button.type = 'button';
  button.onclick = () => {
    const gateway = availability.ostiarius.baseUrl;
    if (!gateway) return;
    button.disabled = true;
    message.textContent = 'Osからpasskeyチャレンジを取得中…';
    void performCheckin(gateway, ctx).then(async () => {
      message.textContent = '出席を記録しました。';
      await rerender();
    }).catch((error) => {
      message.textContent = error instanceof Error ? error.message : String(error);
      button.disabled = false;
    });
  };
  checkin.body.append(button, message);
  return checkin.wrap;
}

async function performCheckin(gatewayBaseUrl: string, ctx: PanelContext): Promise<void> {
  const options = await gatewayPost<Record<string, unknown>>(
    gatewayBaseUrl,
    '/checkin/begin',
    {},
  );
  const assertion = await startAuthentication({ optionsJSON: options as never });
  const finish = await gatewayPost<{ attestation?: string }>(
    gatewayBaseUrl,
    '/checkin/finish',
    { response: assertion },
  );
  if (!finish.attestation) throw new Error('Osが出席証明を返しませんでした。');
  const response = await ctx.api('/checkin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ attestation: finish.attestation }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `出席記録に失敗しました (${response.status})。`);
  }
}

async function gatewayPost<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Osへの接続に失敗しました (${response.status})。`);
  return value as T;
}

function attendanceRow(
  user: AttendanceUser,
  editable: boolean,
  ctx: PanelContext,
  rerender: () => Promise<void>,
): HTMLLIElement {
  const row = el('li');
  const main = el('div', 'gl-row');
  main.appendChild(el('strong', undefined, user.eventTitle ?? 'イベント出席なし'));
  if (editable) main.appendChild(el('span', 'gl-muted', user.displayName ?? '名前未取得'));
  main.appendChild(el('span', `gl-tag ${user.status}`, STATUS_LABELS[user.status]));
  if (user.checkedInAt) {
    main.appendChild(el('span', 'gl-muted', `出席: ${fmtDateTime(user.checkedInAt)}`));
  }

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
