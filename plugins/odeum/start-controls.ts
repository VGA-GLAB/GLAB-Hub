import { el, fmtDateTime, type PanelContext } from '../panel-kit.ts';

interface EventOption { id: number; title: string; createdBy: string; startsAt: number; }

/** Optional event selection and native-app launch; no browser capture starts here. */
export function streamStartControls(ctx: PanelContext, enabled: boolean): HTMLElement {
  const form = el('form', 'gl-section');
  const eventLabel = el('label', undefined, '関連イベント（任意）');
  const eventSelect = el('select', 'gl-input');
  const none = el('option', undefined, 'イベントなし');
  none.value = '';
  eventSelect.appendChild(none);
  eventLabel.appendChild(eventSelect);
  const titleLabel = el('label', undefined, '配信名');
  const title = el('input', 'gl-input');
  title.type = 'text';
  title.required = true;
  title.maxLength = 120;
  title.placeholder = '配信名を入力';
  titleLabel.appendChild(title);
  eventSelect.onchange = () => {
    titleLabel.hidden = eventSelect.value !== '';
    title.required = eventSelect.value === '';
  };
  const start = el('button', 'gl-btn', 'このPCで配信を始める');
  start.type = 'submit';
  start.disabled = !enabled;
  const message = el('p', 'gl-muted');
  message.setAttribute('role', 'status');
  const launch = el('div');
  form.append(eventLabel, titleLabel, start, message, launch);
  form.appendChild(el('p', 'gl-muted',
    'このPCにOdeumアプリが必要です。ブラウザの確認を許可してください。開かない場合はアプリの導入・関連付けを確認してください。'));
  if (!enabled) message.textContent = '配信の中継設定がないため開始できません。';
  void loadEvents();

  async function loadEvents(): Promise<void> {
    try {
      // Include today's already-started events. Recurrences share a single event session.
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      const response = await ctx.hubApi(`/api/x/events/events?from=${encodeURIComponent(day.toISOString())}`);
      if (!response.ok) throw new Error('events_unavailable');
      const body = await response.json() as { events: EventOption[] };
      const seen = new Set<number>();
      for (const event of body.events) {
        if (seen.has(event.id) || (!ctx.identity.isAdmin && event.createdBy !== ctx.identity.userId)) continue;
        seen.add(event.id);
        const option = el('option', undefined, `${event.title} (${fmtDateTime(event.startsAt)})`);
        option.value = String(event.id);
        eventSelect.appendChild(option);
      }
    } catch {
      form.appendChild(el('p', 'gl-notice', 'イベントを取得できませんでした。イベントなしで開始するか、画面を更新してください。'));
    }
  }

  form.onsubmit = (event) => {
    event.preventDefault();
    if (start.disabled) return;
    if (!eventSelect.value && !title.value.trim()) {
      message.textContent = '配信名を入力してください。';
      return;
    }
    start.disabled = true;
    eventSelect.disabled = true;
    title.disabled = true;
    launch.replaceChildren();
    message.textContent = '配信を準備中…';
    const input = eventSelect.value ? { eventId: Number(eventSelect.value) } : { title: title.value.trim() };
    void ctx.hubApi('/api/x/odeum/sessions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }).then(async (response) => {
      if (!response.ok) {
        message.textContent = response.status === 409
          ? 'このイベントは別の配信または合成番組で使用中です。イベント画面を確認してください。'
          : response.status === 403 || response.status === 404
            ? '選んだイベントで配信を開始できません。権限やイベントを確認してください。'
            : '配信を準備できませんでした。設定や接続を確認してください。';
        return;
      }
      const body = await response.json() as { presentUrl: string; expiresAt: number; resumed: boolean };
      if (!form.isConnected) return;
      const link = el('a', 'gl-btn', 'Odeumアプリを開く');
      link.href = body.presentUrl;
      link.onclick = (click) => {
        if (Date.now() < body.expiresAt) return;
        click.preventDefault();
        message.textContent = 'リンクの期限が切れました。開始ボタンをもう一度押してください。';
      };
      launch.appendChild(link);
      message.textContent = body.resumed
        ? '準備済みの配信を開き直します。接続状態は「更新」で確認してください。'
        : '配信を準備しました。アプリを開き、接続状態は「更新」で確認してください。';
      window.location.href = body.presentUrl;
    }).catch(() => {
      message.textContent = '開始結果を取得できませんでした。同じ条件で押し直すと準備済みの配信を開き直します。';
    }).finally(() => {
      start.disabled = !enabled;
      eventSelect.disabled = false;
      title.disabled = false;
    });
  };
  return form;
}
