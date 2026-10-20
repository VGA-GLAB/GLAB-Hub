import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { CernereProjectApi } from '../plugins/cernere/shared-owner.ts';
import { getUserPermissions, canEditPresence } from '../plugins/cernere/user-permissions.ts';

it('reads only the authenticated user and does not infer permission from missing or false values', async () => {
  const client = {
    async call(module: string, action: string, payload: unknown) {
      assert.equal(module, 'managed_project');
      if (action === 'update_schema') return {};
      assert.equal(action, 'get_user_permissions');
      assert.deepEqual(payload, { userId: 'self' });
      return { permissions: [{ key: 'user_data.module:presence', allowed: false, purpose: null }] };
    },
  } as CernereProjectApi;
  assert.equal(canEditPresence(await getUserPermissions(client, 'self')), false);
  assert.equal(canEditPresence([]), false);
  assert.equal(canEditPresence([{ key: 'user_data.module:presence', allowed: true, purpose: null }]), true);
});

it('rejects malformed permission responses', async () => {
  const client = { async call(_module: string, action: string) {
    return action === 'update_schema' ? {} : { permissions: [{ key: 'user_data.module:presence', allowed: 'true' }] };
  } } as CernereProjectApi;
  await assert.rejects(getUserPermissions(client, 'self'), /Invalid permission/);
});
