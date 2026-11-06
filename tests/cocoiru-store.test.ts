// glab_cocoiru_* の store 層を実 SQLite で検証する (spec/feature/cocoiru-backend.md)。
// lease の期限、受信箱の宛先限定、他人の call を消さない ack、タスケテの一括作成と
// レート判定、ロビー secret の収束を確かめる。

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Hono, type CorpusContext } from '../corpus/server/hub/sdk.ts';
import cocoiru from '../plugins/cocoiru/index.ts';
import {
  acknowledgeCall,
  broadcastTasukete,
  countPendingCalls,
  getOrCreateLobbySecret,
  getLobbySecret,
  hasInboxCall,
  hasActiveLease,
  hasRecentCall,
  hasRecentTasukete,
  insertCall,
  listAvailableUserIds,
  listInbox,
  purgeExpired,
  upsertAvailability,
} from '../plugins/cocoiru/store.ts';
import { openTempDb, type TempDb } from './sqlite-fixture.ts';

const call = (id: string, recipientId: string, createdAt: number, senderId = 'sender') => ({
  id, senderId, recipientId, title: `title ${id}`, body: `body ${id}`, createdAt, expiresAt: createdAt + 300_000,
});

describe('glab_cocoiru store', () => {
  let temp!: TempDb;

  before(() => { temp = openTempDb('glab-cocoiru-'); });
  after(() => { temp?.close(); });

  it('treats a lease as active only while available and unexpired', () => {
    upsertAvailability(temp.db, 'alice', true, 10_000);
    upsertAvailability(temp.db, 'bob', false, 10_000);
    upsertAvailability(temp.db, 'carol', true, 5_000);

    assert.deepEqual(listAvailableUserIds(temp.db, 6_000), ['alice']);
    assert.equal(hasActiveLease(temp.db, 'alice', 9_999), true);
    assert.equal(hasActiveLease(temp.db, 'alice', 10_000), false);
    assert.equal(hasActiveLease(temp.db, 'bob', 6_000), false);

    upsertAvailability(temp.db, 'alice', true, 20_000);
    assert.equal(hasActiveLease(temp.db, 'alice', 15_000), true, 'upsert renews the lease');
  });

  it('purges expired leases and calls', () => {
    insertCall(temp.db, { ...call('old', 'alice', 0), expiresAt: 1_000 });
    purgeExpired(temp.db, 6_000);

    assert.equal(hasActiveLease(temp.db, 'carol', 0), false);
    assert.equal(listInbox(temp.db, 'alice', 0).some((row) => row.id === 'old'), false);
  });

  it('lists only the recipient inbox, oldest first, without expired calls', () => {
    insertCall(temp.db, call('in-2', 'dave', 2_000));
    insertCall(temp.db, call('in-1', 'dave', 1_000));
    insertCall(temp.db, call('other', 'erin', 1_500));
    insertCall(temp.db, { ...call('expired', 'dave', 500), expiresAt: 1_200 });

    const inbox = listInbox(temp.db, 'dave', 1_300);
    assert.deepEqual(inbox.map((row) => row.id), ['in-1', 'in-2']);
    assert.ok(inbox.every((row) => row.recipient_id === 'dave' && row.kind === 'call'));
    assert.equal(countPendingCalls(temp.db, 'dave', 1_300), 2);
    assert.equal(hasRecentCall(temp.db, 'sender', 'dave', 1_500), true);
    assert.equal(hasRecentCall(temp.db, 'sender', 'dave', 2_000), false);
  });

  it('acknowledges only calls addressed to the caller', () => {
    assert.equal(acknowledgeCall(temp.db, 'dave', 'other'), false);
    assert.deepEqual(listInbox(temp.db, 'erin', 1_300).map((row) => row.id), ['other']);

    assert.equal(acknowledgeCall(temp.db, 'dave', 'in-1'), true);
    assert.deepEqual(listInbox(temp.db, 'dave', 1_300).map((row) => row.id), ['in-2']);
  });

  it('broadcasts tasukete to every active lease except the sender', () => {
    const now = 100_000;
    upsertAvailability(temp.db, 'helper-1', true, now + 30_000);
    upsertAvailability(temp.db, 'helper-2', true, now + 30_000);
    upsertAvailability(temp.db, 'away', false, now + 30_000);
    upsertAvailability(temp.db, 'asker', true, now + 30_000);

    assert.equal(hasRecentTasukete(temp.db, 'asker', now - 60_000), false);
    const sent = broadcastTasukete(temp.db, {
      senderId: 'asker', title: 'タスケテ', body: 'help', createdAt: now, expiresAt: now + 300_000,
    });

    assert.equal(sent, 2);
    for (const recipient of ['helper-1', 'helper-2']) {
      const [row] = listInbox(temp.db, recipient, now);
      assert.equal(row.kind, 'tasukete');
      assert.equal(row.title, 'タスケテ');
      assert.equal(row.body, 'help');
      assert.equal(row.sender_id, 'asker');
    }
    assert.equal(listInbox(temp.db, 'asker', now).length, 0);
    assert.equal(listInbox(temp.db, 'away', now).length, 0);
    assert.equal(hasRecentTasukete(temp.db, 'asker', now + 59_999 - 60_000), true);
    assert.equal(hasRecentTasukete(temp.db, 'asker', now), false);
  });

  it('returns zero when nobody else holds an active lease', () => {
    const sent = broadcastTasukete(temp.db, {
      senderId: 'helper-1', title: 'タスケテ', body: 'late', createdAt: 900_000, expiresAt: 1_200_000,
    });
    assert.equal(sent, 0);
  });

  it('keeps one 64-hex lobby secret across calls', () => {
    const first = getOrCreateLobbySecret(temp.db, 'a'.repeat(64), 1);
    const second = getOrCreateLobbySecret(temp.db, 'b'.repeat(64), 2);

    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(second, first);
  });

  it('initializes lobby in setup and never recreates missing state through GET', async () => {
    temp.db.prepare('DELETE FROM glab_cocoiru_lobby').run();
    const app = new Hono();
    app.use('*', async (c, next) => {
      c.set('auth', { userId: 'owner', externalId: 'mapped', role: 'general', displayName: 'Owner', projectKey: 'glab', isAdmin: false });
      await next();
    });
    await cocoiru.setup({ db: temp.db, registerRoute: (router: Hono) => { app.route('/api/x/cocoiru', router); },
      registerPanel: () => {}, logger: { info: () => {} } } as unknown as CorpusContext);
    const present = await app.request('/api/x/cocoiru/resident/glab/discord-lobby');
    assert.equal(present.status, 200);
    assert.match((await present.json() as { secret: string }).secret, /^[0-9a-f]{64}$/);
    temp.db.prepare('DELETE FROM glab_cocoiru_lobby').run();
    const missing = await app.request('/api/x/cocoiru/resident/glab/discord-lobby');
    assert.equal(missing.status, 503);
    assert.equal(missing.headers.get('cache-control'), 'private, no-store');
    assert.equal(getLobbySecret(temp.db), null);
  });

  it('reads missing lobby state without creating it and checks exact call recipient ownership', () => {
    temp.db.prepare('DELETE FROM glab_cocoiru_lobby').run();
    assert.equal(getLobbySecret(temp.db), null);
    assert.equal(getLobbySecret(temp.db), null);
    insertCall(temp.db, call('owned-call', 'owner', 1));
    assert.equal(hasInboxCall(temp.db, 'owner', 'owned-call'), true);
    assert.equal(hasInboxCall(temp.db, 'other', 'owned-call'), false);
    acknowledgeCall(temp.db, 'owner', 'owned-call');
    assert.equal(hasInboxCall(temp.db, 'owner', 'owned-call'), false);
  });
});
