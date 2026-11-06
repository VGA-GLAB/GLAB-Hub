import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readOrganizations } from '../plugins/facility/groups.ts';
import type { ServiceIdentityProvider, ServiceUserSession } from '../corpus/server/hub/sdk.ts';

const session: ServiceUserSession = { token: 's'.repeat(43), grant: { projectToken: 'scoped', sessionBinding: 'b'.repeat(43),
  projectKey: 'glab', expiresAt: new Date(Date.now() + 600_000).toISOString(), user: { id: 'subject', role: 'general', displayName: 'Person', email: null } } };
function provider(): ServiceIdentityProvider {
  return { organizations: async current => {
    assert.equal(current, session);
    return [{ id: 'a', name: 'Org a', role: 'owner' }, { id: 'b', name: 'Org b', role: 'admin' }];
  }, faceConsentStatus: async () => assert.fail('Not a consent operation'), createFaceConsent: async () => assert.fail('Not a consent operation'),
  revokeFaceConsent: async () => assert.fail('Not a consent operation') };
}
test('marks only the current caller own owner role, without requesting other member records', async () => {
  assert.deepEqual(await readOrganizations(provider(), session, { withRepresentative: true }), [
    { kind: 'organization', id: 'a', name: 'Org a', representative: true }, { kind: 'organization', id: 'b', name: 'Org b' },
  ]);
});
test('the plain membership response omits roles and representation assertions', async () => {
  assert.deepEqual(await readOrganizations(provider(), session), [
    { kind: 'organization', id: 'a', name: 'Org a' }, { kind: 'organization', id: 'b', name: 'Org b' },
  ]);
});
test('an unknown authority result is not replaced by cached or empty memberships', async () => {
  const source = provider(); let calls = 0;
  source.organizations = async () => { calls++; throw new Error('Unknown result'); };
  await assert.rejects(readOrganizations(source, session), /Unknown result/);
  assert.equal(calls, 1);
});
