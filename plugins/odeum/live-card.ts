// 「いま発表中」カード (frontend)。 ダッシュボード上部と odeum パネルで共用する。
// live セッションが無いときは何も描かない (呼び出し側は null を受けて差し込まない)。

import { el, fmtDateTime, type PanelContext } from '../panel-kit.ts';
import { ensureOdeumStyles } from './styles.ts';

export type LiveRelayState = 'connected' | 'waiting' | 'unknown';

export interface LiveCardView {
  sessionId: string;
  eventId: number;
  eventTitle: string;
  presenterUserId: string;
  presenterName: string | null;
  startedAt: number;
  relayState: LiveRelayState;
  viewerCount: number | null;
  canEnd: boolean;
}

export interface LiveSummary {
  enabled: boolean;
  relayReachable: boolean;
  sessions: LiveCardView[];
}

export async function loadLiveSummary(ctx: PanelContext): Promise<LiveSummary | null> {
  try {
    const response = await ctx.hubApi('/api/x/odeum/live');
    if (!response.ok) return null;
    return await response.json() as LiveSummary;
  } catch {
    return null;
  }
}

const RELAY_STATE_LABEL: Record<LiveRelayState, string> = {
  connected: '配信中',
  waiting: '接続待ち',
  unknown: '中継の状態を確認できません',
};

export interface LiveCardActions {
  onWatch(card: LiveCardView): void;
  onEnd?(card: LiveCardView): void;
}

/** live セッションのカード群。 0 件なら null。 */
export function renderLiveCards(summary: LiveSummary, actions: LiveCardActions): HTMLElement | null {
  if (summary.sessions.length === 0) return null;
  ensureOdeumStyles();
  const wrap = el('section', 'gl-section od-live');
  wrap.appendChild(el('h3', 'gl-section-title', '🎤 いま発表中'));
  for (const card of summary.sessions) {
    const box = el('div', `gl-notice od-live-card od-live-${card.relayState}`);
    box.appendChild(el('strong', 'od-live-title', card.eventTitle));
    const meta = [
      `発表: ${card.presenterName ?? card.presenterUserId}`,
      `${fmtDateTime(card.startedAt)} から`,
      RELAY_STATE_LABEL[card.relayState],
    ];
    if (card.viewerCount != null) meta.push(`視聴者 ${card.viewerCount} 人`);
    box.appendChild(el('div', 'gl-muted', meta.join(' · ')));
    const row = el('div', 'gl-row');
    const watch = el('button', 'gl-btn', '視聴する');
    watch.type = 'button';
    watch.disabled = !summary.enabled;
    watch.onclick = () => actions.onWatch(card);
    row.appendChild(watch);
    if (card.canEnd && actions.onEnd) {
      const end = el('button', 'gl-btn ghost', '発表を終了');
      end.type = 'button';
      end.onclick = () => actions.onEnd?.(card);
      row.appendChild(end);
    }
    box.appendChild(row);
    wrap.appendChild(box);
  }
  if (!summary.enabled) {
    wrap.appendChild(el('p', 'gl-muted', 'ライブ発表の中継が設定されていないため、視聴はできません。'));
  }
  return wrap;
}

export async function endSession(ctx: PanelContext, sessionId: string): Promise<boolean> {
  try {
    const response = await ctx.hubApi(`/api/x/odeum/sessions/${encodeURIComponent(sessionId)}/end`, {
      method: 'POST',
    });
    return response.ok;
  } catch {
    return false;
  }
}
