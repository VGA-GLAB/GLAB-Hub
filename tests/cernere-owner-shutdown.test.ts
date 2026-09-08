import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CernereClientOwner } from '../plugins/cernere/shared-owner.ts';
import { createShutdown } from '../plugins/cernere/shutdown.ts';

test('six plugin acquisitions share one facade and shutdown makes it terminal', async () => {
  const owner = new CernereClientOwner();
  const config = { cernereBaseUrl: 'https://cernere.test/', clientId: 'glab', clientSecret: 'secret', projectKey: 'EducationLab' };
  const clients = Array.from({ length: 6 }, () => owner.get(config));
  assert.ok(clients.every((client) => client === clients[0]));
  owner.closeAll(); owner.closeAll();
  await assert.rejects(clients[0]!.call('presence', 'read', {}), /closed/);
  assert.throws(() => owner.get(config), /closed/);
});

test('revoking a leaked credential stops requests through facades handed out earlier', async () => {
  const owner = new CernereClientOwner();
  const config = { cernereBaseUrl: 'https://cernere.test/', clientId: 'glab', clientSecret: 'secret', projectKey: 'EducationLab' };
  const client = owner.get(config);
  owner.revoke(config);
  // 失効前に配った facade からも到達できない。revoke 自体は冪等。
  await assert.rejects(client.call('presence', 'read', {}), /closed/);
  await assert.rejects(client.getUserData('u1', 'EducationLab', ['a']), /closed/);
  owner.revoke(config);
  // 失効後の再取得は新しい client を作り直す。
  assert.notEqual(owner.get(config), client);
});

test('shutdown is single-flight, closes clients first and attempts every store even when one fails', async () => {
  const calls: string[] = [];
  const shutdown = createShutdown(() => { calls.push('clients'); }, [
    async () => { calls.push('events'); throw new Error('database failure'); },
    async () => { calls.push('facilities'); },
  ]);
  const a = shutdown(); const b = shutdown();
  assert.equal(a, b);
  await assert.rejects(a, AggregateError);
  assert.deepEqual(calls, ['clients', 'events', 'facilities']);
});
