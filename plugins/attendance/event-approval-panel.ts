import { el, section, type PanelContext } from '../panel-kit.ts';
import { loadLiveSummary, renderLiveCards } from '../odeum/live-card.ts';
import { presentControls } from '../odeum/present-controls.ts';
import { mountViewer, type ViewerHandle } from '../odeum/viewer-ui.ts';

interface EventView {
  id: number; title: string; startsAt: number; createdBy: string; organizer: boolean; canRequest: boolean;
  requests: Array<{ userId: string; name: string | null; approved: boolean }>;
}

export async function eventApprovalSection(ctx: PanelContext, rerender: () => Promise<void>): Promise<HTMLElement> {
  const view = section('イベント出席（主催者承認）');
  const response = await ctx.api('/events');
  if (!response.ok) { view.body.append(el('p', undefined, 'イベントを取得できませんでした。')); return view.wrap; }
  const { events } = await response.json() as { events: EventView[] };
  const live = await loadLiveSummary(ctx);
  for (const event of events) {
    const card = section(event.title);
    const message = el('p', 'gl-muted');
    const act = async (action: string, userId?: string): Promise<void> => {
      try {
        const response = await ctx.api(`/events/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ eventId: event.id, startsAt: event.startsAt, ...(userId ? { userId } : {}) }) });
        if (!response.ok) throw new Error();
        await rerender();
      } catch { message.textContent = '保存できませんでした。更新して確認してください。'; }
    };
    const mine = event.requests.find(request => request.userId === ctx.identity.userId);
    if (mine) card.body.append(el('p', undefined, mine.approved ? '出席承認済み' : '主催者の承認待ち'));
    else if (event.canRequest) {
      const request = el('button', 'gl-btn', '参加を申請');
      request.onclick = () => { request.disabled = true; void act('request'); };
      card.body.append(request);
    }
    if (event.organizer) for (const request of event.requests) {
      const row = el('div', 'gl-row', request.name ?? request.userId);
      if (request.approved) row.append(el('span', undefined, '出席承認済み'));
      else {
        const approve = el('button', 'gl-btn', 'OK（出席を承認）');
        approve.onclick = () => { approve.disabled = true; void act('approve', request.userId); };
        row.append(approve);
      }
      card.body.append(row);
    }
    if (live) {
      const byEvent = new Map(live.sessions.flatMap(item => item.eventId == null ? [] : [[item.eventId, item] as const]));
      const controls = presentControls(ctx, event, { enabled: live.enabled, byEvent }, rerender);
      if (controls) card.body.append(controls);
      const stage = el('div');
      let viewer: ViewerHandle | null = null;
      let observer: MutationObserver | null = null;
      const dispose = () => { viewer?.dispose(); viewer = null; observer?.disconnect(); window.removeEventListener('pagehide', dispose); };
      const cards = renderLiveCards({ ...live, sessions: live.sessions.filter(item => item.eventId === event.id) }, {
        onWatch: item => {
          dispose();
          viewer = mountViewer(stage, ctx, item.sessionId, () => { viewer = null; observer?.disconnect(); window.removeEventListener('pagehide', dispose); });
          observer = new MutationObserver(() => { if (!stage.isConnected) dispose(); });
          observer.observe(document.body, { childList: true, subtree: true });
          window.addEventListener('pagehide', dispose, { once: true });
        },
      });
      if (cards) card.body.append(cards, stage);
    }
    card.body.append(message);
    view.body.append(card.wrap);
  }
  if (!events.length) view.body.append(el('p', 'gl-muted', '対象のイベントはありません。'));
  return view.wrap;
}
