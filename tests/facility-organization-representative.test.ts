import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
import { readOrganizations } from '../plugins/facility/groups.ts';

/** Minimal Cernere /auth stand-in: organization list and per-organization member lists. */
async function cernere(members: Record<string, { userId: string; role: string; email?: string }[]>): Promise<{ url: string; requests: unknown[]; close: () => Promise<void> }> {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1', handleProtocols: () => 'bearer' });
  const requests: unknown[] = [];
  server.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'connected', user_state: { userId: 'me' } }));
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString()) as { module: string; action: string; payload: { organizationId?: string } };
      requests.push(message);
      if (message.module === 'organization') {
        ws.send(JSON.stringify({ type: 'module_response', module: 'organization', action: 'list',
          payload: Object.keys(members).map(id => ({ id, name: `Org ${id}`, slug: id })) }));
      } else if (message.module === 'member') {
        ws.send(JSON.stringify({ type: 'module_response', module: 'member', action: 'list', payload: members[message.payload.organizationId ?? ''] ?? [] }));
      }
    });
  });
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests, close: () => new Promise(resolve => server.close(() => resolve())) };
}

test('marks only the organizations the caller owns as represented, and keeps other members out', async () => {
  const fake = await cernere({
    a: [{ userId: 'me', role: 'owner' }, { userId: 'other', role: 'member', email: 'other@example.com' }],
    b: [{ userId: 'me', role: 'admin' }, { userId: 'other', role: 'owner' }],
  });
  try {
    const groups = await readOrganizations(fake.url, 'token', 'me', { withRepresentative: true });
    assert.deepEqual(groups, [
      { kind: 'organization', id: 'a', name: 'Org a', representative: true },
      { kind: 'organization', id: 'b', name: 'Org b' },
    ]);
  } finally { await fake.close(); }
});

test('the plain membership read does not ask Cernere for member lists', async () => {
  const fake = await cernere({ a: [{ userId: 'me', role: 'owner' }] });
  try {
    assert.deepEqual(await readOrganizations(fake.url, 'token', 'me'), [{ kind: 'organization', id: 'a', name: 'Org a' }]);
    assert.equal(fake.requests.length, 1);
  } finally { await fake.close(); }
});
