import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureSchema } from '../plugins/data.ts';
import {
  endOdeumSession,
  getOdeumSession,
  listLiveOdeumSessions,
  startOdeumSession,
} from '../plugins/odeum/session-store.ts';
import contract from '../contracts/odeum-session-store.contract.ts';
import { openTempDb } from './sqlite-fixture.ts';

test('sessions move from live to ended exactly once', () => {
  const temp = openTempDb('glab-odeum-');
  try {
    const { db } = temp;
    const started = startOdeumSession(db, { eventId: 7, presenterUserId: 'p1', now: 1_000, id: 's1' });
    assert.equal(started.kind, 'created');
    // node:sqlite の行は null プロトタイプなので、値だけを比べるために平のオブジェクトへ写す。
    assert.deepEqual({ ...getOdeumSession(db, 's1') }, {
      id: 's1', eventId: 7, presenterUserId: 'p1', status: 'live', startedAt: 1_000, endedAt: null,
    });

    const before = getOdeumSession(db, 's1');
    const ended = endOdeumSession(db, 's1', 2_000);
    assert.equal(contract.post(ended, before, getOdeumSession(db, 's1')), true);
    assert.equal(ended, true);
    assert.equal(getOdeumSession(db, 's1')?.status, 'ended');
    assert.equal(getOdeumSession(db, 's1')?.endedAt, 2_000);

    const beforeAgain = getOdeumSession(db, 's1');
    const again = endOdeumSession(db, 's1', 3_000);
    assert.equal(contract.post(again, beforeAgain, getOdeumSession(db, 's1')), true);
    assert.equal(again, false, 'ended から再度終了しても状態は変えない');
    assert.equal(getOdeumSession(db, 's1')?.endedAt, 2_000);
    assert.equal(endOdeumSession(db, 'missing'), false);
  } finally {
    temp.close();
  }
});

test('one live session per event: the same presenter resumes, others conflict', () => {
  const temp = openTempDb('glab-odeum-');
  try {
    const { db } = temp;
    assert.equal(startOdeumSession(db, { eventId: 1, presenterUserId: 'p1', id: 'a' }).kind, 'created');
    const resumed = startOdeumSession(db, { eventId: 1, presenterUserId: 'p1', id: 'b' });
    assert.equal(resumed.kind, 'resumed');
    assert.equal(resumed.session.id, 'a');
    assert.equal(startOdeumSession(db, { eventId: 1, presenterUserId: 'p2', id: 'c' }).kind, 'conflict');
    assert.equal(startOdeumSession(db, { eventId: 2, presenterUserId: 'p2', id: 'd' }).kind, 'created');
    assert.deepEqual(listLiveOdeumSessions(db).map((row) => row.id).sort(), ['a', 'd']);

    endOdeumSession(db, 'a');
    const next = startOdeumSession(db, { eventId: 1, presenterUserId: 'p2', id: 'e' });
    assert.equal(next.kind, 'created', '終了後は新しいセッションで再開する');
    assert.deepEqual(listLiveOdeumSessions(db).map((row) => row.id).sort(), ['d', 'e']);
  } finally {
    temp.close();
  }
});

test('the schema stays idempotent and rejects unknown states', () => {
  const temp = openTempDb('glab-odeum-');
  try {
    ensureSchema(temp.db);
    ensureSchema(temp.db);
    assert.throws(() => temp.db.prepare(`INSERT INTO glab_odeum_sessions
      (id, event_id, presenter_user_id, status, started_at) VALUES ('x', 1, 'p', 'paused', 0)`).run());
  } finally {
    temp.close();
  }
});
