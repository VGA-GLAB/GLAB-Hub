import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { CernereProjectApi } from '../plugins/cernere/shared-owner.ts';
import { getMemberLocation, setMemberLocation } from '../plugins/dashboard/location-client.ts';
import { setAvailability } from '../plugins/consult/presence-client.ts';
import { getSelfAvailability } from '../plugins/consult/self-availability.ts';

function replacementStore(failFirst = false) {
  let columns = new Set<string>();
  let declarations = 0;
  const row: Record<string, unknown> = {};
  const client = {
    async call(_module: string, action: string, payload: Record<string, unknown>) {
      if (action === 'update_schema') {
        declarations++;
        if (failFirst && declarations === 1) throw new Error('schema unavailable');
        columns = new Set(Object.keys((payload.user_data as { columns: object }).columns));
        return {};
      }
      const keys = action === 'set_user_data'
        ? Object.keys(payload.data as object) : payload.columns as string[];
      for (const key of keys) assert.ok(columns.has(key), `undeclared column: ${key}`);
      if (action === 'set_user_data') Object.assign(row, payload.data);
      return { ...row };
    },
  } as CernereProjectApi;
  return { client, declarations: () => declarations };
}

for (const locationFirst of [true, false]) {
  it(`keeps location and availability writable with locationFirst=${locationFirst}`, async () => {
    const store = replacementStore();
    if (locationFirst) await getMemberLocation(store.client, 'self');
    else await getSelfAvailability(store.client, 'self', 0);
    await Promise.all([
      setMemberLocation(store.client, 'self', 'school'),
      setAvailability(store.client, 'self', true, null),
    ]);
    assert.equal(await getMemberLocation(store.client, 'self'), 'school');
    assert.equal(await getSelfAvailability(store.client, 'self', 0), true);
    assert.equal(store.declarations(), 1);
  });
}

it('fails the request on declaration failure and retries next time', async () => {
  const store = replacementStore(true);
  await assert.rejects(setMemberLocation(store.client, 'self', 'home'), /schema unavailable/);
  await setAvailability(store.client, 'self', false, null);
  await setMemberLocation(store.client, 'self', 'home');
  assert.equal(await getMemberLocation(store.client, 'self'), 'home');
  assert.equal(store.declarations(), 2);
});
