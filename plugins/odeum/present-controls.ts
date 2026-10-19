// イベント行の「配信を始める」 / 「配信を終了」 (frontend)。
// 開始できるのはイベント作成者か管理者だけ (サーバ側でも同じ判定をする)。
// 開始すると odeum:// リンクを出し、 配信者アプリ (odeum-presenter) を起動させる。

import { el, type PanelContext } from '../panel-kit.ts';
import { invitationToggle } from './invitation-view.ts';
import { endSession, loadLiveSummary, type LiveCardView } from './live-card.ts';
import { programControls } from './program-controls.ts';

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
  const start = el('button', 'gl-btn', session ? '配信者アプリを開き直す' : '配信を始める');
  start.type = 'button';
  start.onclick = () => {
    start.disabled = true;
    message.textContent = '配信を準備中…';
    void ctx.hubApi('/api/x/odeum/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId: event.id }),
    }).then(async (response) => {
      if (!response.ok) {
        message.textContent = response.status === 409
          ? '別の人がこのイベントで配信中です。'
          : response.status === 403
            ? 'このイベントの配信を始める権限がありません。'
            : `配信を始められませんでした (${response.status})。`;
        return;
      }
      const body = await response.json() as { presentUrl: string; session: { id: string } };
      message.textContent = '';
      const link = el('a', 'gl-btn', '配信者アプリを起動');
      link.href = body.presentUrl;
      box.replaceChild(link, start);
      box.appendChild(el('span', 'gl-muted', 'リンクは 5 分間有効です。'));
      if (!session) box.appendChild(invitationToggle(ctx, body.session.id));
      if (!session) box.appendChild(programControls(ctx, body.session.id, owner));
      // 配信者アプリ (odeum://) を起動する。 ブラウザが確認を出す場合はリンクを押してもらう。
      window.location.href = body.presentUrl;
    }).catch(() => {
      message.textContent = '配信を始められませんでした。';
    }).finally(() => {
      start.disabled = false;
    });
  };
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
