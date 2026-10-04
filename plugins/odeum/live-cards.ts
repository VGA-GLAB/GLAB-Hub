// ダッシュボード「いま発表中」カードの抽出 (サーバ側の純関数)。
//
// 台帳の live セッションのうち、 閲覧者が見られるイベントのものだけを出す。
// 中継の状態 (relay) が取れなかったときも台帳からカードを作り、 状態は unknown とする。

import type { OdeumSessionRow } from './session-store.ts';
import type { RelaySessionStatus } from './relay-client.ts';

/** connected = 発表者が中継に接続中 / waiting = 接続待ち / unknown = 中継に届かない。 */
export type LiveRelayState = 'connected' | 'waiting' | 'unknown';

export interface LiveEventInfo {
  title: string;
  visible: boolean;
  createdBy: string;
}

export interface LiveCard {
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

export interface LiveCardViewer {
  userId: string;
  isAdmin: boolean;
}

export function buildLiveCards(
  sessions: readonly OdeumSessionRow[],
  events: ReadonlyMap<number, LiveEventInfo>,
  relay: ReadonlyMap<string, RelaySessionStatus> | null,
  viewer: LiveCardViewer,
  displayName: (userId: string) => string | null,
): LiveCard[] {
  const cards: LiveCard[] = [];
  for (const session of sessions) {
    if (session.status !== 'live') continue;
    const event = events.get(session.eventId);
    if (!event?.visible) continue;
    const status = relay?.get(session.id) ?? null;
    cards.push({
      sessionId: session.id,
      eventId: session.eventId,
      eventTitle: event.title,
      presenterUserId: session.presenterUserId,
      presenterName: displayName(session.presenterUserId),
      startedAt: session.startedAt,
      relayState: relay == null ? 'unknown' : status?.presenterConnected ? 'connected' : 'waiting',
      viewerCount: status?.viewerCount ?? (relay == null ? null : 0),
      canEnd: viewer.isAdmin
        || session.presenterUserId === viewer.userId
        || event.createdBy === viewer.userId,
    });
  }
  return cards;
}
