import type { LiveCard, LiveEventInfo } from '../plugins/odeum/live-cards.ts';
import type { RelaySessionStatus } from '../plugins/odeum/relay-client.ts';
import type { OdeumSessionRow } from '../plugins/odeum/session-store.ts';

export default {
  /** C-5: live かつ閲覧可能なイベントだけをカードにし、 中継不達でも台帳から出す (unknown)。 */
  post: (
    cards: LiveCard[],
    sessions: readonly OdeumSessionRow[],
    events: ReadonlyMap<number, LiveEventInfo>,
    relay: ReadonlyMap<string, RelaySessionStatus> | null,
  ): boolean => {
    const expected = sessions
      .filter((session) => session.status === 'live' && events.get(session.eventId)?.visible === true)
      .map((session) => session.id);
    return JSON.stringify(cards.map((card) => card.sessionId)) === JSON.stringify(expected)
      && (relay != null || cards.every((card) => card.relayState === 'unknown'));
  },
};
