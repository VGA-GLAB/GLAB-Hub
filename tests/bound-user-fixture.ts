/** Endpoint-unit fixture only. No Cr credential is issued or validated here. */
import type { AuthIdentity, Context, ServiceUserSession, TokenProvider } from '../corpus/server/hub/sdk.ts';

export function boundTestSession(overrides: Partial<AuthIdentity> = {}): ServiceUserSession {
  const identity = { userId: 'unit-member', role: 'general', displayName: 'Unit member', projectKey: 'glab', ...overrides };
  return { token: 's'.repeat(43), grant: { projectToken: 'unit-scoped-grant', sessionBinding: 'b'.repeat(43), projectKey: identity.projectKey ?? 'glab',
    expiresAt: new Date(Date.now() + 600_000).toISOString(), user: { id: identity.userId, role: identity.role, displayName: identity.displayName ?? '', email: null } } };
}
export function setBoundTestUser(c: Context, overrides: Partial<AuthIdentity> = {}): void {
  const identity: AuthIdentity = { userId: 'unit-member', externalId: 'unit-member', role: 'general', displayName: 'Unit member', projectKey: 'glab', isAdmin: false, ...overrides };
  c.set('auth', identity);
  c.set('serviceUserSession', boundTestSession(identity));
}
/** Prepared-request stand-in for endpoint tests; shared SDK crypto/serialization
 * and actual authority consumption have separate contract suites.
 */
export function testDelegationProvider(): TokenProvider {
  return { mode: 'unit-fixture', authorize: async (session, _target, request) => {
    if (!session) return null;
    const headers = new Headers(request.init?.headers);
    headers.delete('cookie'); headers.set('authorization', `Cernere-Delegation ${'d'.repeat(43)}`);
    return { path: request.path, init: { ...request.init, headers } };
  } };
}
