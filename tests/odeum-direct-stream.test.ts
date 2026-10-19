import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureSchema } from '../plugins/data.ts';
import { buildLiveCards } from '../plugins/odeum/live-cards.ts';
import { canEndPresentation } from '../plugins/odeum/permissions.ts';
import { startSchema } from '../plugins/odeum/start-request.ts';
import { endOdeumSession, getOdeumSession, listLiveOdeumSessions, startDirectSession, startOdeumSession } from '../plugins/odeum/session-store.ts';
import { openTempDb } from './sqlite-fixture.ts';

test('direct streams preserve event rows, resume per presenter and end once', () => {
  const temp = openTempDb('glab-direct-');
  try {
    const { db } = temp;
    startOdeumSession(db, { eventId: 8, presenterUserId: 'p1', id: 'event', now: 10 });
    ensureSchema(db);
    ensureSchema(db);
    const first = startDirectSession(db, { title: 'Standalone', presenterUserId: 'p1', id: 'direct', now: 20 });
    assert.equal(first.kind, 'created');
    assert.equal(first.session.eventId, null);
    assert.equal(startDirectSession(db, { title: 'Retry', presenterUserId: 'p1', id: 'retry' }).session.id, 'direct');
    assert.equal(getOdeumSession(db, 'direct')?.title, 'Standalone');
    assert.equal(getOdeumSession(db, 'event')?.eventId, 8);
    assert.deepEqual(listLiveOdeumSessions(db).map((row) => row.id), ['event', 'direct']);
    assert.equal(startDirectSession(db, { title: 'Second member', presenterUserId: 'p2', id: 'other' }).kind, 'created');
    assert.equal(endOdeumSession(db, 'direct', 30), true);
    assert.equal(endOdeumSession(db, 'direct', 40), false);
    assert.equal(getOdeumSession(db, 'direct')?.endedAt, 30);
    assert.equal(startDirectSession(db, { title: 'New stream', presenterUserId: 'p1', id: 'next' }).kind, 'created');
  } finally { temp.close(); }
});

test('start payload distinguishes optional event selection from malformed event', () => {
  assert.deepEqual(startSchema.parse({ title: '  Live  ' }), { title: 'Live' });
  assert.equal(startSchema.safeParse({ eventId: 12 }).success, true);
  for (const body of [{}, { title: '' }, { title: '   ' }, { title: 'x'.repeat(121) },
    { eventId: 0 }, { eventId: '12' }, { eventId: null }, { title: 'x', eventId: 12 },
    { title: 'x', mode: 'program' }]) {
    assert.equal(startSchema.safeParse(body).success, false);
  }
});

test('direct card uses title without event and never invents relay connectivity', () => {
  const session = { id: 'direct', eventId: null, title: 'Live', presenterUserId: 'owner',
    status: 'live' as const, startedAt: 10, endedAt: null };
  const viewer = { userId: 'viewer', isAdmin: false };
  const cards = buildLiveCards([session, { ...session, id: 'hidden', eventId: 99 }], new Map(), null, viewer, () => null);
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.eventTitle, 'Live');
  assert.equal(cards[0]?.relayState, 'unknown');
  assert.equal(cards[0]?.canEnd, false);
  assert.equal(canEndPresentation(session, null, viewer), false);
  assert.equal(canEndPresentation(session, null, { userId: 'owner', isAdmin: false }), true);
  assert.equal(buildLiveCards([session], new Map(), new Map(), viewer, () => null)[0]?.relayState, 'waiting');
});
