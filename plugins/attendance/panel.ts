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

interface AttendanceRecord {
  id: string;
  userId: string;
  displayName: string | null;
  date: string;
  facilityId: string;
  checkedInAt: number;
  source: 'passkey' | 'manual';
  eventTitle: string | null;
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
  ostiarius: { status: 'up' | 'degraded' | 'down'; detail?: string; baseUrl: string | null };
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.append(el('h2', undefined, '✅ 出席'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    head.append(refresh);
    container.append(head);

    const availabilityResponse = await ctx.api('/availability');
    if (!availabilityResponse.ok) {
      container.append(errorNotice('出席可能状態を取得できませんでした。'));
      return;
    }
    const availability = await availabilityResponse.json() as Availability;
    const localOstiariusReachable = Boolean(
      availability.event && availability.ostiarius.baseUrl
      && await canReachLocalOstiarius(availability.ostiarius.baseUrl),
    );
    container.append(checkinSection(availability, localOstiariusReachable, ctx, render));

    const mineResponse = await ctx.api('/mine');
    const mine = section('直近30日の出席履歴');
    if (!mineResponse.ok) {
      mine.body.append(errorNotice('出席履歴を取得できませんでした。'));
    } else {
      const body = await mineResponse.json() as { attendance?: AttendanceRecord[] };
      appendAttendanceList(mine.body, body.attendance ?? [], ctx.identity.displayName);
    }
    container.append(mine.wrap);

    if (ctx.identity.isAdmin) {
      container.append(await adminSection(ctx, render));
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
    checkin.body.append(el('strong', undefined, '進行中のイベントはありません'));
    message.textContent = 'イベントが始まると出席できます。';
  } else {
    checkin.body.append(el('strong', undefined, availability.event.title));
    checkin.body.append(el('div', 'gl-muted', `${fmtDateTime(availability.event.startsAt)}〜${fmtDateTime(availability.event.endsAt)}`));
    if (availability.ostiarius.status !== 'up' || !localOstiariusReachable) {
      message.textContent = '会場Wi-Fi内のOsに接続できないため、現在は出席できません。';
    }
  }
  if (!availability.enabled || !availability.ostiarius.baseUrl || !localOstiariusReachable) {
    checkin.body.append(message);
    return checkin.wrap;
  }
  const button = el('button', 'gl-btn', '出席');
  button.type = 'button';
  button.onclick = () => {
    const gateway = availability.ostiarius.baseUrl;
    if (!gateway) return;
    button.disabled = true;
    message.textContent = 'Osからpasskeyチャレンジを取得中…';
    void performCheckin(gateway, ctx).then(async (alreadyCheckedIn) => {
      message.textContent = alreadyCheckedIn ? '本日の出席は既に記録されています。' : '出席を記録しました。';
      await rerender();
    }).catch((error) => {
      message.textContent = error instanceof Error ? error.message : String(error);
      button.disabled = false;
    });
  };
  checkin.body.append(button, message);
  return checkin.wrap;
}

async function adminSection(ctx: PanelContext, rerender: () => Promise<void>): Promise<HTMLElement> {
  const admin = section('管理者: 本日の台帳と手動記録');
  const date = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
  const response = await ctx.api(`/list?date=${encodeURIComponent(date)}`);
  if (!response.ok) admin.body.append(errorNotice('本日の台帳を取得できませんでした。'));
  else appendAttendanceList(admin.body, (await response.json() as { attendance?: AttendanceRecord[] }).attendance ?? []);

  const form = el('form', 'gl-row');
  const userId = el('input', 'gl-input');
  userId.placeholder = 'Cernere user ID';
  userId.required = true;
  const facilityId = el('input', 'gl-input');
  facilityId.placeholder = '施設 ID';
  facilityId.required = true;
  const submit = el('button', 'gl-btn', '手動で記録');
  form.append(userId, facilityId, submit);
  form.onsubmit = (event) => {
    event.preventDefault();
    submit.disabled = true;
    void ctx.api('/manual', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: userId.value, facilityId: facilityId.value, date }),
    }).then((result) => {
      if (!result.ok) throw new Error(`HTTP ${result.status}`);
      return rerender();
    }).catch(() => { submit.disabled = false; });
  };
  admin.body.append(form);
  return admin.wrap;
}

function appendAttendanceList(container: HTMLElement, rows: AttendanceRecord[], ownName?: string | null): void {
  if (!rows.length) {
    container.append(el('p', 'gl-muted', '出席記録はありません。'));
    return;
  }
  const list = el('ul', 'gl-list');
  for (const row of rows) {
    const item = el('li');
    item.append(el('strong', undefined, ownName || row.displayName || row.userId));
    item.append(el('span', 'gl-muted', ` ${row.date} / ${row.facilityId} / ${fmtDateTime(row.checkedInAt)}`));
    item.append(el('span', 'gl-tag', row.source === 'manual' ? '手動' : 'passkey'));
    list.append(item);
  }
  container.append(list);
}

async function performCheckin(gatewayBaseUrl: string, ctx: PanelContext): Promise<boolean> {
  const options = await gatewayPost<Record<string, unknown>>(gatewayBaseUrl, '/checkin/begin', {});
  const assertion = await startAuthentication({ optionsJSON: options as never });
  const finish = await gatewayPost<{ attestation?: string }>(gatewayBaseUrl, '/checkin/finish', { response: assertion });
  if (!finish.attestation) throw new Error('Osが出席証明を返しませんでした。');
  const response = await ctx.api('/checkin', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ attestation: finish.attestation }),
  });
  const body = await response.json().catch(() => null) as { error?: string; alreadyCheckedIn?: boolean } | null;
  if (!response.ok) throw new Error(body?.error ?? `出席記録に失敗しました (${response.status})。`);
  return body?.alreadyCheckedIn === true;
}

async function gatewayPost<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Osへの接続に失敗しました (${response.status})。`);
  return value as T;
}

function errorNotice(message: string): HTMLElement {
  const box = el('div', 'gl-notice gl-notice-error');
  box.append(el('strong', undefined, message));
  return box;
}
