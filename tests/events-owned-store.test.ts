/** Tests callback/transaction boundaries with a bounded driver fixture, not a live PostgreSQL claim.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventStore, EventOwnerRejected, type EventMutationOwner } from '../plugins/events/store.ts';

function fixture() {
  const state = { owner: 'subject', exists: true, active: true, afterWrite: () => {}, commits: 0, rollbacks: 0 };
  const calls: { sql: string; values: readonly unknown[] }[] = [];
  const tx = Object.assign(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push({ sql: strings.join('?'), values }); state.afterWrite(); return [{ id: 7 }];
  }, { unsafe: async (sql: string, values: readonly unknown[]) => {
    calls.push({ sql, values }); assert.equal(sql, 'SELECT created_by FROM glab_event WHERE id=$1 FOR UPDATE');
    assert.deepEqual(values, [7]); return state.exists ? [{ created_by: state.owner }] : [];
  } });
  const driver = { begin: async (execute: (transaction: typeof tx) => Promise<unknown>) => {
    try { const value = await execute(tx); state.commits++; return value; }
    catch (error) { state.rollbacks++; throw error; }
  } };
  const store = new EventStore(driver as unknown as ConstructorParameters<typeof EventStore>[0]);
  const owner: EventMutationOwner = { userId: 'subject', isAdmin: false, assertCurrent: () => { if (!state.active) throw new Error('Actor ended'); } };
  return { state, store, calls, owner };
}

test('Meet metadata and deletion acquire the row lock, check current owner and use one transaction', async () => {
  const f = fixture();
  await f.store.setMeetUrl(7, 'https://meet.google.com/abc-defg-hij', f.owner);
  assert.match(f.calls[0]!.sql, /FOR UPDATE$/); assert.match(f.calls[1]!.sql, /^UPDATE glab_event SET meet_url/);
  assert.equal(f.state.commits, 1);
  f.calls.length = 0;
  assert.equal(await f.store.delete(7, f.owner), true);
  assert.equal(f.calls.length, 3); assert.match(f.calls[0]!.sql, /FOR UPDATE$/);
  assert.match(f.calls[1]!.sql, /DELETE FROM glab_event_occurrence_notified/);
  assert.match(f.calls[2]!.sql, /DELETE FROM glab_event WHERE/); assert.equal(f.state.commits, 2);
});

test('missing/current-other-owner rows cannot write and post-write actor loss escapes the transaction callback', async () => {
  const f = fixture(); f.state.owner = 'other';
  await assert.rejects(f.store.setMeetUrl(7, 'https://meet.google.com/abc-defg-hij', f.owner), error => error instanceof EventOwnerRejected && error.code === 'forbidden');
  assert.equal(f.calls.length, 1); assert.equal(f.state.commits, 0); assert.equal(f.state.rollbacks, 1);
  f.calls.length = 0; f.state.owner = f.owner.userId; f.state.exists = false;
  await assert.rejects(f.store.delete(7, f.owner), error => error instanceof EventOwnerRejected && error.code === 'not_found');
  assert.equal(f.calls.length, 1); assert.equal(f.state.commits, 0);
  f.calls.length = 0; f.state.exists = true; f.state.afterWrite = () => { f.state.active = false; };
  await assert.rejects(f.store.delete(7, f.owner), /Actor ended/);
  assert.equal(f.calls.length, 2); assert.equal(f.state.commits, 0); assert.equal(f.state.rollbacks, 3);
});

test('event insertion checks current authority before and after its single write without network compensation', async () => {
  const f = fixture(); f.state.afterWrite = () => { f.state.active = false; };
  await assert.rejects(f.store.create({ title: 'Event', startsAt: 1000, createdBy: 'subject' }, f.owner.assertCurrent), /Actor ended/);
  assert.equal(f.calls.length, 1); assert.match(f.calls[0]!.sql, /INSERT INTO glab_event/);
  assert.equal(f.state.commits, 0); assert.equal(f.state.rollbacks, 1);
});
