import {
  el,
  fmtDateTime,
  section,
  ensureStyles,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';

interface EventView {
  id: number;
  title: string;
  body: string | null;
  location: string | null;
  startsAt: number;
  endsAt: number | null;
  facilityId: string | null;
  notified: boolean;
}

interface FacilityView {
  id: string;
  displayName: string;
  location?: string | null;
}

interface FacilityCatalog {
  items: FacilityView[];
  suggestions: FacilityView[];
  aedilisAvailable: boolean;
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '📅 イベント'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.type = 'button';
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    const facilityResponse = await ctx.api('/facilities');
    const catalog = facilityResponse.ok
      ? await facilityResponse.json() as FacilityCatalog
      : { items: [], suggestions: [], aedilisAvailable: false };
    container.appendChild(eventForm(ctx, render, catalog));

    const list = section('今後のイベント');
    const response = await ctx.api('/events');
    if (!response.ok) {
      list.body.appendChild(el('p', 'gl-muted', 'イベントを取得できませんでした。'));
    } else {
      const body = await response.json() as { events?: EventView[] };
      const events = body.events ?? [];
      if (events.length === 0) {
        list.body.appendChild(el('p', 'gl-muted', '(予定されているイベントはありません)'));
      } else {
        const rows = el('ul', 'gl-list');
        for (const event of events) rows.appendChild(eventRow(event, ctx, render));
        list.body.appendChild(rows);
      }
    }
    container.appendChild(list.wrap);
  }

  await render();
}

function eventForm(
  ctx: PanelContext,
  rerender: () => Promise<void>,
  catalog: FacilityCatalog,
): HTMLElement {
  const form = section('イベントを登録');
  const title = el('input', 'gl-input');
  title.placeholder = 'イベント名';
  const startsAt = el('input', 'gl-input');
  startsAt.type = 'datetime-local';
  const facility = el('select', 'gl-select');
  const placeholder = el('option', undefined, '使用施設を選択');
  placeholder.value = '';
  facility.appendChild(placeholder);
  appendFacilityGroup(facility, 'GLAB施設', catalog.items);
  appendFacilityGroup(facility, 'Aedilis候補', catalog.suggestions);
  facility.disabled = catalog.items.length + catalog.suggestions.length === 0;
  const hours = el('select', 'gl-select');
  for (let value = 1; value <= 8; value += 1) {
    const option = el('option', undefined, `${value}時間`);
    option.value = String(value);
    hours.appendChild(option);
  }
  const description = el('textarea', 'gl-textarea');
  description.placeholder = '詳細 (任意)';
  const submit = el('button', 'gl-btn', 'イベントを登録');
  submit.type = 'button';
  const message = el('p', 'gl-muted');
  submit.onclick = () => {
    if (!title.value.trim() || !startsAt.value || !facility.value) {
      message.textContent = 'イベント名、開始日時、使用施設を選択してください。';
      return;
    }
    const start = new Date(startsAt.value);
    const end = new Date(start.getTime() + Number(hours.value) * 60 * 60 * 1_000);
    submit.disabled = true;
    message.textContent = 'イベントを登録中…';
    void ctx.api('/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: title.value,
        body: description.value || undefined,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        facilityId: facility.value,
      }),
    }).then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => null) as
          | { code?: string; downstreamStatus?: number }
          | null;
        message.textContent = response.status === 409
          ? '同じ時間帯に施設予約が入っています。'
          : body?.downstreamStatus
            ? `Aedilisの予約作成に失敗しました (${body.downstreamStatus}${body.code ? `: ${body.code}` : ''})。`
            : `登録に失敗しました (${response.status})。`;
        return;
      }
      await rerender();
    }).catch(() => {
      message.textContent = '登録に失敗しました。';
    }).finally(() => {
      submit.disabled = false;
    });
  };
  const row = el('div', 'gl-row');
  row.append(title, startsAt, facility, hours, submit);
  if (!catalog.aedilisAvailable) {
    message.textContent = catalog.items.length > 0
      ? 'Aedilisに接続できないため、登録時の予約作成に失敗する可能性があります。'
      : 'Aedilisに接続できないため、施設候補を取得できません。';
  }
  form.body.append(row, description, message);
  return form.wrap;
}

function appendFacilityGroup(
  select: HTMLSelectElement,
  label: string,
  facilities: FacilityView[],
): void {
  if (facilities.length === 0) return;
  const group = el('optgroup');
  group.label = label;
  for (const facility of facilities) {
    const suffix = facility.location ? ` (${facility.location})` : '';
    const option = el('option', undefined, `${facility.displayName}${suffix}`);
    option.value = facility.id;
    group.appendChild(option);
  }
  select.appendChild(group);
}

function eventRow(
  event: EventView,
  ctx: PanelContext,
  rerender: () => Promise<void>,
): HTMLLIElement {
  const row = el('li');
  row.appendChild(el('strong', undefined, event.title));
  const period = event.endsAt
    ? `${fmtDateTime(event.startsAt)}〜${fmtDateTime(event.endsAt)}`
    : fmtDateTime(event.startsAt);
  row.appendChild(el('div', 'gl-muted', period));
  if (event.location || event.facilityId) {
    row.appendChild(el('span', 'gl-tag', event.location ?? event.facilityId ?? ''));
  }
  if (event.notified) row.appendChild(el('span', 'gl-tag', '通知済'));
  if (event.body) row.appendChild(el('div', 'gl-muted', event.body));
  const remove = el('button', 'gl-btn ghost', 'イベントを削除');
  remove.type = 'button';
  let force = false;
  remove.onclick = () => {
    remove.disabled = true;
    const path = force ? `/events/${event.id}?force=1` : `/events/${event.id}`;
    void ctx.api(path, { method: 'DELETE' }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return rerender();
    }).catch(() => {
      // 施設予約の取り消しに失敗した場合など。次クリックはローカル削除を強行する。
      force = true;
      remove.textContent = '予約解除に失敗 — 強制削除する';
      remove.disabled = false;
    });
  };
  row.appendChild(remove);
  return row;
}
