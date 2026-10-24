// イベント行の「配信を始める」 / 「配信を終了」 (frontend)。
// 開始できるのはイベント作成者か管理者だけ (サーバ側でも同じ判定をする)。
// 配信開始でブラウザの画面選択を開き、Odeumへ送信する。

import { el, type PanelContext } from '../panel-kit.ts';
import { invitationToggle } from './invitation-view.ts';
import { endSession, loadLiveSummary, type LiveCardView } from './live-card.ts';
import { programControls } from './program-controls.ts';
import { startScreenPresentation } from './presenter-ui.ts';

export interface PresentableEvent {
  id: number;
  createdBy: string;
}

/** live セッションを event id で引けるようにする。 取得できなければ空。 */
export async function loadLiveByEvent(ctx: PanelContext): Promise<{ enabled: boolean; byEvent: Map<number, LiveCardView> }> {
  const summary = await loadLiveSummary(ctx);
  return {
    enabled: summary?.enabled ?? false,
    byEvent: new Map((summary?.sessions ?? []).flatMap((card) => card.eventId == null ? [] : [[card.eventId, card] as const])),
  };
}

export function presentControls(
  ctx: PanelContext,
  event: PresentableEvent,
  live: { enabled: boolean; byEvent: Map<number, LiveCardView> },
  rerender: () => Promise<void>,
): HTMLElement | null {
  const owner = ctx.identity.isAdmin || event.createdBy === ctx.identity.userId;
  const session = live.byEvent.get(event.id);
  if (!owner && !session) return null;

  const box = el('div', 'gl-row');
  if (session) box.appendChild(el('span', 'gl-tag', session.relayState === 'connected' ? '🎤 配信中' : '🎤 配信準備済み'));
  if (session && live.enabled) box.appendChild(programControls(ctx, session.sessionId, owner));
  if (!owner || !live.enabled) return box;

  const message = el('span', 'gl-muted');
  if (!session) {
    const prepare = el('button', 'gl-btn', '合成番組を準備');
    prepare.type = 'button';
    prepare.onclick = () => {
      prepare.disabled = true;
      void ctx.hubApi('/api/x/odeum/sessions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ eventId: event.id, mode: 'program' }),
      }).then(async (response) => {
        if (!response.ok) throw new Error('program_prepare_failed');
        await rerender();
      }).catch(() => { message.textContent = '番組を準備できませんでした。'; })
        .finally(() => { prepare.disabled = false; });
    };
    box.appendChild(prepare);
  }
  const start = el('button', 'gl-btn', '配信開始');
  start.type = 'button';
  start.onclick = () => startScreenPresentation(ctx, { eventId: event.id });
  box.appendChild(start);

  if (session) {
    box.appendChild(invitationToggle(ctx, session.sessionId));
    const end = el('button', 'gl-btn ghost', '配信を終了');
    end.type = 'button';
    end.onclick = () => {
      end.disabled = true;
      void endSession(ctx, session.sessionId).then(() => rerender());
    };
    box.appendChild(end);
  }
  box.appendChild(message);
  return box;
}
