import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Context, ServiceConnector, TokenProvider } from '../corpus/server/hub/sdk.ts';
import { authorizedConnectorFetch, proxy, proxyStream } from '../plugins/shared.ts';
import { AedilisEventClient, AedilisRequestError } from '../plugins/events/aedilis-client.ts';

function context(method = 'GET', body?: string): Context {
  const raw = new Request('http://glab.test/media?offset=1', {
    method,
    body,
    headers: { 'content-type': 'application/octet-stream', range: 'bytes=2-5' },
  });
  return {
    req: {
      method,
      url: raw.url,
      raw,
      text: () => raw.text(),
      header: (key: string) => raw.headers.get(key) ?? undefined,
    },
    get: (key: string) => key === 'userToken' ? 'user-access-token' : undefined,
  } as unknown as Context;
}

function connector(fetch: ServiceConnector['fetch']): ServiceConnector {
  return {
    id: 'aedilis', title: 'Aedilis', scope: 'multi', baseUrl: 'http://aedilis.test',
    health: async () => ({ status: 'up' }), fetch,
  };
}

const unavailableTokens: Array<[string, () => Promise<string | null>]> = [
  ['null', async () => null],
  ['empty', async () => ''],
  ['whitespace', async () => ' \t '],
  ['issuer rejection', async () => { throw new Error('secret-issuer-detail'); }],
];

describe('downstream authorization boundary', () => {
  for (const relay of [authorizedConnectorFetch, proxy, proxyStream]) {
    for (const [label, getDownstreamToken] of unavailableTokens) {
      it(`${relay.name}: ${label} never sends an anonymous request`, async () => {
        let calls = 0;
        const c = connector(async () => { calls++; return new Response('public fallback'); });
        const response = await relay(context(), c, '/private', { mode: 'test', getDownstreamToken });
        assert.equal(calls, 0);
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('cache-control'), 'private, no-store');
        assert.deepEqual(await response.json(), {
          error: 'downstream_token_unavailable', connector: 'aedilis',
        });
      });
    }
  }

  it('does not reuse a caller supplied bearer when token issuance fails', async () => {
    const response = await authorizedConnectorFetch(
      context(), connector(async () => assert.fail('must not send')), '/private',
      { mode: 'test', getDownstreamToken: async () => null }, 'aedilis',
      { headers: { authorization: 'Bearer stale-caller-token' } },
    );
    assert.equal(response.status, 503);
  });

  it('does not request credentials or fetch when the connector is unconfigured', async () => {
    const c = connector(async () => assert.fail('must not send'));
    const response = await authorizedConnectorFetch(context(), { ...c, baseUrl: '' }, '/private', {
      mode: 'test', getDownstreamToken: async () => assert.fail('must not issue'),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'connector_unconfigured', connector: 'aedilis' });
  });

  it('forwards the minted bearer, requested audience, and request options', async () => {
    const controller = new AbortController();
    const requestHeaders = new Headers({ authorization: 'Bearer stale', 'x-request-id': 'request-1' });
    let calls = 0;
    const response = await authorizedConnectorFetch(context(), connector(async (path, init) => {
      calls++;
      assert.equal(path, '/private?offset=1');
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, 'payload');
      assert.equal(init?.signal, controller.signal);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), 'Bearer minted');
      assert.equal(headers.get('x-request-id'), 'request-1');
      return new Response('accepted', { status: 201 });
    }), '/private?offset=1', {
      mode: 'test',
      async getDownstreamToken(incoming, target) {
        assert.equal(incoming, 'user-access-token');
        assert.deepEqual(target, { service: 'aedilis', projectKey: 'project-key', baseUrl: 'http://aedilis.test' });
        return 'minted';
      },
    }, 'project-key', { method: 'POST', body: 'payload', headers: requestHeaders, signal: controller.signal });
    assert.equal(calls, 1);
    assert.equal(response.status, 201);
    assert.equal(requestHeaders.get('authorization'), 'Bearer stale');
  });

  it('retains binary upload, query, Range and partial response headers', async () => {
    const c = context('PUT', 'binary-payload');
    const response = await proxyStream(c, connector(async (path, init) => {
      assert.equal(path, '/media?offset=1');
      assert.equal(init?.body, c.req.raw.body);
      assert.equal(init?.method, 'PUT');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('range'), 'bytes=2-5');
      assert.equal(headers.get('authorization'), 'Bearer minted');
      assert.equal(headers.get('content-type'), 'application/octet-stream');
      return new Response(new Uint8Array([0, 255, 128, 1]), {
        status: 206,
        headers: { 'content-type': 'application/octet-stream', 'content-range': 'bytes 2-5/6',
          'accept-ranges': 'bytes', 'content-length': '4' },
      });
    }), '/media', { mode: 'test', getDownstreamToken: async () => 'minted' });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 2-5/6');
    assert.equal(response.headers.get('content-length'), '4');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0, 255, 128, 1]));
  });

  it('propagates the authentication failure through the direct Aedilis event client', async () => {
    const tokens: TokenProvider = { mode: 'test', getDownstreamToken: async () => null };
    const client = new AedilisEventClient(connector(async () => assert.fail('must not send')), tokens);
    await assert.rejects(client.listFacilities(context()), (error: unknown) =>
      error instanceof AedilisRequestError && error.status === 503 && error.code === 'downstream_token_unavailable');
  });
});
