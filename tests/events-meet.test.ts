import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import type { Context, CorpusContext, ServiceConnector } from '../corpus/server/hub/sdk.ts';
import { issueEventMeet, isMeetUrl } from '../plugins/events/meet-client.ts';
import { meetOAuthRedirectUri, requestOrigin } from '../plugins/facility/meet-oauth.ts';

function fixture(reply: () => Response) {
  const secret = randomBytes(48).toString('base64url');
  const c = {
    get: (key: string) => key === 'userToken' ? 'token' : key === 'auth' ? { userId: 'member' } : undefined,
    req: { method: 'POST', url: 'http://glab.test/api/x/events/events', text: async () => assert.fail('must not read the caller body'), header: () => undefined },
  } as unknown as Context;
  const ctx = { env: () => secret, logger: { error() {} }, tokenProvider: { mode: 'test', getDownstreamToken: async () => 'delegated' } } as unknown as CorpusContext;
  const sent: { path: string; body: unknown; payload: Record<string, unknown> }[] = [];
  const connector: ServiceConnector = {
    id: 'aedilis', title: 'Aedilis', baseUrl: 'http://aedilis.test', scope: 'multi', health: async () => ({ status: 'up' }),
    fetch: async (path, init) => {
      if (path === '/api/reservations/capabilities') return Response.json({ groupContextVersion: 1 });
      const [encoded] = (new Headers(init?.headers).get('x-glab-booking-context') ?? '').split('.');
      sent.push({ path, body: init?.body, payload: JSON.parse(Buffer.from(encoded ?? '', 'base64url').toString('utf8')) });
      return reply();
    },
  };
  return { c, ctx, connector, sent };
}

const groups = async () => [{ kind: 'organization' as const, id: 'org-1', name: 'GLab' }];

test('an event Meet is requested from Aedilis through the signed relay with the chosen organization', async () => {
  const { c, ctx, connector, sent } = fixture(() => Response.json({ status: 'ready', url: 'https://meet.google.com/abc-defg-hij' }));
  assert.deepEqual(await issueEventMeet(c, ctx, connector, 42, 'org-1', groups), { url: 'https://meet.google.com/abc-defg-hij' });
  assert.equal(sent[0]?.path, '/api/meet/external/glab-event/42');
  assert.equal(sent[0]?.body, JSON.stringify({ organizationId: 'org-1' }));
  assert.equal(sent[0]?.payload.method, 'POST');
  assert.deepEqual(sent[0]?.payload.groups, [{ kind: 'organization', id: 'org-1', name: 'GLab' }]);
  await issueEventMeet(c, ctx, connector, 43, null, groups);
  assert.equal(sent[1]?.body, '{}');
});

test('only a Google Meet URL is accepted and upstream errors stay short', async () => {
  const forged = fixture(() => Response.json({ status: 'ready', url: 'https://evil.example/x' }));
  assert.ok('error' in await issueEventMeet(forged.c, forged.ctx, forged.connector, 42, null, groups));
  const refused = fixture(() => Response.json({ error: '所属する組織を選んでください' }, { status: 403 }));
  assert.deepEqual(await issueEventMeet(refused.c, refused.ctx, refused.connector, 42, 'org-2', groups), { error: '所属する組織を選んでください' });
  assert.equal(isMeetUrl('https://meet.google.com/abc-defg-hij'), true);
  assert.equal(isMeetUrl('javascript:alert(1)'), false);
});

test('the Meet callback follows the origin the browser used, not the shared catalog URL', () => {
  assert.equal(requestOrigin('http://localhost:4451/api/x/facility/meet/oauth/start', 'https'), 'https://localhost:4451');
  assert.equal(
    meetOAuthRedirectUri(requestOrigin('http://glab.ai-run-do.com/api/x/facility/meet/oauth/start', 'https')),
    'https://glab.ai-run-do.com/api/x/facility/meet/oauth/callback',
  );
  assert.equal(requestOrigin('http://localhost:5187/x', undefined), 'http://localhost:5187');
  assert.equal(requestOrigin('http://localhost:5187/x', 'gopher'), 'http://localhost:5187');
});
