import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import type { Context, CorpusContext, ServiceConnector } from '../corpus/server/hub/sdk.ts';
import { bookingProxy } from '../plugins/facility/booking-proxy.ts';
import {
  meetOAuthCompletion,
  meetOAuthRedirectUri,
  meetOAuthResultPage,
  parseMeetOAuthMode,
} from '../plugins/facility/meet-oauth.ts';

const state = 'A'.repeat(43);

test('the Google redirect URI is GLab\'s own facility callback under the public URL', () => {
  assert.equal(meetOAuthRedirectUri('http://localhost:5187'), 'http://localhost:5187/api/x/facility/meet/oauth/callback');
  assert.equal(meetOAuthRedirectUri('https://glab.example/'), 'https://glab.example/api/x/facility/meet/oauth/callback');
  assert.equal(meetOAuthRedirectUri(undefined), null);
  assert.equal(meetOAuthRedirectUri('ftp://glab.example'), null);
  assert.equal(meetOAuthRedirectUri('not a url'), null);
});

test('only the two authorization modes are accepted', () => {
  assert.equal(parseMeetOAuthMode({ mode: 'organizer' }), 'organizer');
  assert.equal(parseMeetOAuthMode({ mode: 'creator' }), 'creator');
  assert.equal(parseMeetOAuthMode({ mode: 'admin' }), null);
  assert.equal(parseMeetOAuthMode(null), null);
});

test('a cancelled or malformed Google return is not relayed to Aedilis', () => {
  assert.deepEqual(meetOAuthCompletion({ state, code: 'one-use', error: undefined }), { state, code: 'one-use' });
  assert.equal(meetOAuthCompletion({ state, code: 'one-use', error: 'access_denied' }), null);
  assert.equal(meetOAuthCompletion({ state: 'short', code: 'one-use', error: undefined }), null);
  assert.equal(meetOAuthCompletion({ state, code: undefined, error: undefined }), null);
  assert.equal(meetOAuthCompletion({ state, code: 'x'.repeat(4097), error: undefined }), null);
});

test('the result page only notifies the same origin and never echoes the code or state', () => {
  const page = meetOAuthResultPage('organizer');
  assert.match(page, /postMessage\(\{"type":"glab-meet-oauth","result":"organizer"\}, window\.location\.origin\)/);
  assert.equal(page.includes(state), false);
  assert.match(meetOAuthResultPage('failed'), /やり直してください/);
});

test('a server-built request is signed as sent, ignoring the caller body and query', async () => {
  const secret = randomBytes(48).toString('base64url');
  const serverBody = JSON.stringify({ mode: 'organizer', redirectUri: 'https://glab.example/api/x/facility/meet/oauth/callback' });
  const c = {
    get: (key: string) => key === 'userToken' ? 'token' : key === 'auth' ? { userId: 'admin' } : undefined,
    req: { method: 'GET', url: 'http://glab.test/meet/oauth/callback?state=caller&code=caller', text: async () => assert.fail('must not read the caller body'), header: () => undefined },
  } as unknown as Context;
  const ctx = { env: () => secret, logger: { error() {} }, tokenProvider: { mode: 'test', getDownstreamToken: async () => 'delegated' } } as unknown as CorpusContext;
  const sent: { path: string; body: unknown; payload: Record<string, unknown> }[] = [];
  const connector: ServiceConnector = {
    id: 'aedilis', title: 'Aedilis', baseUrl: 'http://aedilis.test', scope: 'multi', health: async () => ({ status: 'up' }),
    fetch: async (path, init) => {
      if (path === '/api/reservations/capabilities') return Response.json({ groupContextVersion: 1 });
      const [encoded] = (new Headers(init?.headers).get('x-glab-booking-context') ?? '').split('.');
      sent.push({ path, body: init?.body, payload: JSON.parse(Buffer.from(encoded ?? '', 'base64url').toString('utf8')) });
      return Response.json({ url: 'https://accounts.google.com/o/oauth2/v2/auth' });
    },
  };
  const response = await bookingProxy(c, ctx, connector, '/api/meet/oauth/start', async () => [], { method: 'POST', body: serverBody });
  assert.equal(response.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.path, '/api/meet/oauth/start');
  assert.equal(sent[0]?.body, serverBody);
  assert.equal(sent[0]?.payload.method, 'POST');
  assert.equal(sent[0]?.payload.path, '/api/meet/oauth/start');
  assert.equal(sent[0]?.payload.bodyHash, createHash('sha256').update(serverBody).digest('hex'));
});
