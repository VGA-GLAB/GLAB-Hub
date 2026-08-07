import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CernereProjectClient } from '../plugins/cernere/project-client.ts';
import { listAvailable, resolveDiscordId, setAvailability } from '../plugins/consult/presence-client.ts';
import { declarePresenceSchema, PRESENCE_COLUMNS } from '../plugins/consult/presence-schema.ts';

class PresenceClientStub {
  readonly calls: Array<{ module: string; action: string; payload: Record<string, unknown> }> = [];

  constructor(private readonly response: unknown) {}

  async call(module: string, action: string, payload: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ module, action, payload });
    return this.response;
  }
}

function asProjectClient(stub: PresenceClientStub): CernereProjectClient {
  return stub as unknown as CernereProjectClient;
}

describe('consult presence Cernere contract', () => {
  it('lists only currently available members and includes the Discord claim', async () => {
    const stub = new PresenceClientStub([{ userId: 'user-1', displayName: 'Neco', discord_id: '123' }]);

    assert.deepEqual(await listAvailable(asProjectClient(stub)), [{ userId: 'user-1', displayName: 'Neco', discordId: '123' }]);
    // presence 操作は schema 宣言の完了を待つ (SPEC-CONSULT-PRESENCE-004) ため、
    // 最初の呼び出しは必ず update_schema になる。
    assert.equal(stub.calls[0].action, 'update_schema');
    assert.deepEqual(stub.calls[1], {
      module: 'managed_project',
      action: 'list_user_data',
      payload: {
        columns: ['available_now', 'available_until'],
        where: { available_now: true },
        activeAt: { column: 'available_until' },
        claims: ['discord_id'],
      },
    });
    assert.equal(stub.calls.length, 2);
  });

  it('uses the Discord claim for resolution and updates only presence fields', async () => {
    const resolveStub = new PresenceClientStub({ userId: 'user-1', displayName: 'Neco' });
    assert.deepEqual(await resolveDiscordId(asProjectClient(resolveStub), '123'), { userId: 'user-1', displayName: 'Neco' });
    assert.equal(resolveStub.calls[0].action, 'update_schema');
    assert.deepEqual(resolveStub.calls[1], {
      module: 'managed_project', action: 'resolve_user_by_claim', payload: { claim: 'discord_id', value: '123' },
    });

    const writeStub = new PresenceClientStub({});
    await setAvailability(asProjectClient(writeStub), 'user-1', true, '2026-08-07T12:00:00.000Z');
    assert.equal(writeStub.calls[0].action, 'update_schema');
    assert.deepEqual(writeStub.calls[1], {
      module: 'managed_project', action: 'set_user_data', payload: {
        userId: 'user-1', data: { available_now: true, available_until: '2026-08-07T12:00:00.000Z' },
      },
    });
  });

  it('declares once per client and reuses it across presence operations', async () => {
    const stub = new PresenceClientStub([]);
    await listAvailable(asProjectClient(stub));
    await listAvailable(asProjectClient(stub));

    const declarations = stub.calls.filter((call) => call.action === 'update_schema');
    assert.equal(declarations.length, 1);
  });

  it('declares only the two owned presence columns', async () => {
    const stub = new PresenceClientStub({});
    await declarePresenceSchema(asProjectClient(stub), assert.fail);
    assert.deepEqual(stub.calls[0], {
      module: 'managed_project', action: 'update_schema', payload: { user_data: { columns: PRESENCE_COLUMNS } },
    });
  });
});
