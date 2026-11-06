/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';

const identity: AuthIdentity = { userId: 'owner', externalId: 'mapped', role: 'general', displayName: 'Owner', projectKey: 'glab', isAdmin: false };
const context = (method: string, path: string): Context => ({ req: { method, path, query: () => 'other' } } as unknown as Context);
function fixture() {
  const state = { admitted: true, queriedSubject: '' };
  configureAdmissionPolicy({ prepare: (sql: string) => ({ get: (subject: string) => {
    if (!sql.includes('glab_admission')) throw new Error('Unexpected resource query');
    state.queriedSubject = subject; return { status: state.admitted ? 'approved' : 'pending' };
  } }) } as unknown as SqlDb);
  return state;
}

test('all own profile actions classify sensitive GET and important PUT with fresh verified-subject admission', async () => {
  const state = fixture();
  for (const [suffix, action] of [['profile', 'identity.profile'], ['public-name', 'identity.public-name'], ['steam-profile', 'identity.steam-profile']]) {
    for (const method of ['GET', 'PUT']) {
      const c = context(method, '/api/x/vantan-user/' + suffix), operation = glabOperationPolicy(c); assert.ok(operation);
      assert.equal(operation.action, action + (method === 'GET' ? '.read' : '.update'));
      assert.equal(operation.risk, method === 'GET' ? 'sensitive_read' : 'important');
      assert.equal(await operation.authorizeResource(c, identity), true); assert.equal(state.queriedSubject, 'owner');
      state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
      assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
    }
  }
});

test('settings navigation remains an admitted subject-bound read; unknown methods and foreign profile paths stay refused', async () => {
  const state = fixture(), c = context('GET', '/api/x/vantan-user/cernere-link'), operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(operation.action, 'identity.settings-link.read'); assert.equal(operation.risk, 'read');
  assert.equal(await operation.authorizeResource(c, identity), true);
  state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false);
  for (const [method, suffix] of [['POST', 'profile'], ['DELETE', 'steam-profile'], ['PUT', 'cernere-link'], ['GET', 'profile/other'], ['GET', 'export'], ['HEAD', 'profile']]) {
    assert.equal(glabOperationPolicy(context(method!, '/api/x/vantan-user/' + suffix)), null);
  }
});
