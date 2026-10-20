import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { CernereProjectApi } from '../plugins/cernere/shared-owner.ts';
import { getSelfAvailability } from '../plugins/consult/self-availability.ts';

function clientFor(response: unknown): { client: CernereProjectApi; reads: Array<Record<string, unknown>> } {
  const reads: Array<Record<string, unknown>> = [];
  const client = {
    async call(module: string, action: string, payload: Record<string, unknown>): Promise<unknown> {
      assert.equal(module, 'managed_project');
      if (action === 'update_schema') return {};
      assert.equal(action, 'get_user_data');
      reads.push(payload);
      return response;
    },
  } as CernereProjectApi;
  return { client, reads };
}

it('reads only the signed-in member without roster or Discord claims', async () => {
  const { client, reads } = clientFor({ available_now: true, available_until: null });
  assert.equal(await getSelfAvailability(client, 'self', 0), true);
  assert.deepEqual(reads, [{ userId: 'self', columns: ['available_now', 'available_until'] }]);
});

it('handles unset, unavailable, active and expired states', async () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  for (const [row, expected] of [
    [null, false], [{}, false], [{ available_now: false }, false],
    [{ available_now: true, available_until: '2026-10-20T12:00:01Z' }, true],
    [{ available_now: true, available_until: '2026-10-20T12:00:00Z' }, false],
    [{ available_now: true, available_until: '2026-10-20T11:00:00Z' }, false],
  ] as const) {
    assert.equal(await getSelfAvailability(clientFor(row).client, 'self', now), expected);
  }
});

it('rejects malformed state rather than reporting unavailable', async () => {
  for (const row of [[], 'bad', { available_now: 'true' },
    { available_now: true, available_until: 'bad' }, { available_now: true, available_until: 123 }]) {
    await assert.rejects(getSelfAvailability(clientFor(row).client, 'self', 0));
  }
});
