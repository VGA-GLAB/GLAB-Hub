import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { Hono, type CorpusContext, type ServiceIdentityProvider, type ServiceUserSession } from '../corpus/server/hub/sdk.ts';
import { registerFaceConsentRoutes } from '../plugins/vantan-user/face-consent-routes.ts';

const session: ServiceUserSession = { token: 's'.repeat(43), grant: { projectToken: 'scoped', sessionBinding: 'b'.repeat(43),
  projectKey: 'glab', expiresAt: new Date(Date.now() + 600_000).toISOString(), user: { id: 'subject', role: 'general', displayName: 'Person', email: null } } };
const facilityId = '11111111-1111-4111-8111-111111111111';
function fixture(provider?: ServiceIdentityProvider) {
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('serviceUserSession', session); await next(); });
  registerFaceConsentRoutes(app, { identityProvider: provider, env: (key: string) => key === 'CERNERE_BASE_URL' ? 'http://localhost:8086' : undefined } as unknown as CorpusContext);
  return app;
}
function identity(): ServiceIdentityProvider {
  return { organizations: async () => [], faceConsentStatus: async current => { assert.equal(current, session); return []; },
    createFaceConsent: async () => {}, revokeFaceConsent: async () => {} };
}
test('retired biometric endpoints do not return synthetic success', async () => {
  const app = fixture(identity());
  for (const path of ['/face-photo/me', '/face-photo/status', '/face-photo/user/another', '/face-photo']) {
    assert.equal((await app.request(path)).status, 404);
  }
});
test('own consent mutations pass only the bound session, explicit facility and current policy', async () => {
  const provider = identity(); let calls = 0;
  provider.createFaceConsent = async (current, actualFacility, policy) => {
    calls++; assert.equal(current, session); assert.equal(actualFacility, facilityId); assert.equal(policy, 'current-policy');
  };
  const response = await fixture(provider).request('/face-consent', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facilityId, policyVersion: 'current-policy' }) });
  assert.equal(response.status, 200); assert.equal(calls, 1);
});
test('cannot select another user or inject biometric data in a consent request', async () => {
  const provider = identity(); provider.createFaceConsent = async () => assert.fail('Must not mutate');
  const response = await fixture(provider).request('/face-consent', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ facilityId, policyVersion: 'current', userId: 'another', photo: 'bytes' }) });
  assert.equal(response.status, 400);
});
test('missing/unknown identity authority results remain unavailable and are never retried', async () => {
  assert.equal((await fixture().request('/face-consent/status')).status, 503);
  const provider = identity(); let calls = 0;
  provider.revokeFaceConsent = async () => { calls++; throw new Error('private-credential-detail'); };
  const response = await fixture(provider).request(`/face-consent?facilityId=${facilityId}`, { method: 'DELETE' });
  assert.equal(response.status, 503); assert.equal(calls, 1);
  assert.doesNotMatch(await response.text(), /private-credential-detail/);
});
test('public policy retrieval sends no user/project credentials', async t => {
  t.after(() => mock.restoreAll());
  mock.method(globalThis, 'fetch', async (url: URL, init: RequestInit) => {
    assert.equal(url.href, 'http://localhost:8086/api/identity/face-consent/policy');
    assert.equal(new Headers(init.headers).get('authorization'), null); assert.equal(init.credentials, 'omit');
    return Response.json({ version: 'current', text: 'Facility-only policy' });
  });
  const response = await fixture(identity()).request('/face-consent/policy');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { version: 'current', text: 'Facility-only policy' });
});
