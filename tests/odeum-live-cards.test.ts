import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLiveCards, type LiveEventInfo } from '../plugins/odeum/live-cards.ts';
import type { RelaySessionStatus } from '../plugins/odeum/relay-client.ts';
import type { OdeumSessionRow } from '../plugins/odeum/session-store.ts';
import contract from '../contracts/odeum-live-cards.contract.ts';

const sessions: OdeumSessionRow[] = [
  { id: 's1', eventId: 1, presenterUserId: 'p1', status: 'live', startedAt: 10, endedAt: null },
  { id: 's2', eventId: 2, presenterUserId: 'p2', status: 'live', startedAt: 20, endedAt: null },
  { id: 's3', eventId: 3, presenterUserId: 'p3', status: 'ended', startedAt: 5, endedAt: 9 },
  { id: 's4', eventId: 4, presenterUserId: 'p4', status: 'live', startedAt: 30, endedAt: null },
];
const events = new Map<number, LiveEventInfo>([
  [1, { title: '公開イベント', visible: true, createdBy: 'c1' }],
  [2, { title: '別の発表', visible: true, createdBy: 'viewer' }],
  [3, { title: '終了済み', visible: true, createdBy: 'c3' }],
  [4, { title: '役職限定', visible: false, createdBy: 'c4' }],
]);
const viewer = { userId: 'viewer', isAdmin: false };
const names = (userId: string) => (userId === 'p1' ? '発表者1' : null);

test('dashboard shows only live sessions of visible events', () => {
  const relay = new Map<string, RelaySessionStatus>([
    ['s1', { sid: 's1', presenterConnected: true, viewerCount: 12, startedAt: null }],
    ['s2', { sid: 's2', presenterConnected: false, viewerCount: 0, startedAt: null }],
  ]);
  const cards = buildLiveCards(sessions, events, relay, viewer, names);
  assert.equal(contract.post(cards, sessions, events, relay), true);
  assert.deepEqual(cards.map((card) => [card.sessionId, card.relayState, card.viewerCount, card.canEnd]), [
    ['s1', 'connected', 12, false],
    ['s2', 'waiting', 0, true],
  ]);
  assert.equal(cards[0]?.presenterName, '発表者1');
  assert.equal(cards[0]?.eventTitle, '公開イベント');
});

test('cards still come from the ledger when the relay is unreachable', () => {
  const cards = buildLiveCards(sessions, events, null, viewer, names);
  assert.equal(contract.post(cards, sessions, events, null), true);
  assert.deepEqual(cards.map((card) => [card.sessionId, card.relayState, card.viewerCount]), [
    ['s1', 'unknown', null],
    ['s2', 'unknown', null],
  ]);
});

test('no live sessions means no card at all', () => {
  assert.deepEqual(buildLiveCards([], events, null, viewer, names), []);
  assert.deepEqual(buildLiveCards(sessions.filter((s) => s.status === 'ended'), events, null, viewer, names), []);
});

test('sessions whose event was deleted are not shown', () => {
  assert.deepEqual(buildLiveCards(sessions, new Map(), null, { userId: 'admin', isAdmin: true }, names), []);
});
