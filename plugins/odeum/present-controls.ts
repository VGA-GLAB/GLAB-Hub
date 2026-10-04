// イベント行の「発表を始める」 / 「発表を終了」 (frontend)。
// 開始できるのはイベント作成者か管理者だけ (サーバ側でも同じ判定をする)。
// 開始すると odeum:// リンクを出し、 発表者アプリ (odeum-presenter) を起動させる。

import { el, type PanelContext } from '../panel-kit.ts';
import { endSession, loadLiveSummary, type LiveCardView } from './live-card.ts';

export interface PresentableEvent {
  id: number;
  createdBy: string;
}

/** live セッションを event id で引けるようにする。 取得できなければ空。 */
export async function loadLiveByEvent(ctx: PanelContext): Promise<{ enabled: boolean; byEvent: Map<number, LiveCardView> }> {
  const summary = await loadLiveSummary(ctx);
  return {
    enabled: summary?.enabled ?? false,
    byEvent: new Map((summary?.sessions ?? []).map((card) => [card.eventId, card])),
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
  if (session) box.appendChild(el('span', 'gl-tag', '🎤 発表中'));
  if (!owner || !live.enabled) return box;

  const message = el('span', 'gl-muted');
  const start = el('button', 'gl-btn', session ? '発表者アプリを開き直す' : '発表を始める');
  start.type = 'button';
  start.onclick = () => {
    start.disabled = true;
    message.textContent = '発表を準備中…';
    void ctx.hubApi('/api/x/odeum/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: event.id }),
    }).then(async (response) => {
      if (!response.ok) {
        message.textContent = response.status === 409
          ? '別の人がこのイベントで発表中です。'
          : response.status === 403
            ? 'このイベントの発表を始める権限がありません。'
            : `発表を始められませんでした (${response.status})。`;
        return;
      }
      const body = await response.json() as { presentUrl: string };
      message.textContent = '';
      const link = el('a', 'gl-btn', '発表者アプリを起動');
      link.href = body.presentUrl;
      box.replaceChild(link, start);
      box.appendChild(el('span', 'gl-muted', 'リンクは 5 分間有効です。'));
      // 発表者アプリ (odeum://) を起動する。 ブラウザが確認を出す場合はリンクを押してもらう。
      window.location.href = body.presentUrl;
    }).catch(() => {
      message.textContent = '発表を始められませんでした。';
    }).finally(() => {
      start.disabled = false;
    });
  };
  box.appendChild(start);

  if (session) {
    const end = el('button', 'gl-btn ghost', '発表を終了');
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
