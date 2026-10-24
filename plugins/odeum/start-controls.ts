import { startScreenPresentation } from './presenter-ui.ts';
import { el, fmtDateTime, type PanelContext } from '../panel-kit.ts';

interface EventOption { id: number; title: string; createdBy: string; startsAt: number; }

/** Optional event selection with browser screen capture on the submitting PC. */
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
  const start = el('button', 'gl-btn', '配信開始');
  start.type = 'submit';
  start.disabled = !enabled;
  const message = el('p', 'gl-muted');
  message.setAttribute('role', 'status');
  form.append(eventLabel, titleLabel, start, message);
  form.appendChild(el('p', 'gl-muted',
    'このPCの共有する画面を選んで配信します。共有する音声の有無は、画面選択時に確認してください。'));
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
    const input = eventSelect.value ? { eventId: Number(eventSelect.value) } : { title: title.value.trim() };
    startScreenPresentation(ctx, input);
  };
  return form;
}
