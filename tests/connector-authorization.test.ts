import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Hono, type Context, type ServiceConnector, type TokenProvider, type ServiceUserSession } from '../corpus/server/hub/sdk.ts';
import { authorizedConnectorFetch, proxy, proxyStream } from '../plugins/shared.ts';
import { AedilisEventClient, AedilisRequestError } from '../plugins/events/aedilis-client.ts';

const session: ServiceUserSession = { token: 's'.repeat(43), grant: { projectToken: 'scoped', sessionBinding: 'b'.repeat(43), projectKey: 'glab',
  expiresAt: new Date(Date.now() + 600_000).toISOString(), user: { id: 'subject', role: 'general', displayName: 'Person', email: null } } };
function connector(fetch: ServiceConnector['fetch'], id = 'aedilis'): ServiceConnector {
  return { id, title: id, scope: 'multi', baseUrl: 'https://target.example', health: async () => ({ status: 'up' }), fetch };
}
function app(relay: (c: Context) => Promise<Response>): Hono {
  const router = new Hono(); router.use('*', async (c, next) => { c.set('serviceUserSession', session); await next(); });
  router.all('*', relay); return router;
}
describe('one-operation downstream authorization boundary', () => {
  for (const relay of [authorizedConnectorFetch, proxy, proxyStream]) {
    for (const rejected of [false, true]) it(`${relay.name}: unavailable authorization never falls through anonymously (${rejected})`, async () => {
      const source: TokenProvider = { mode: 'fixture', authorize: async current => {
        assert.equal(current, session); if (rejected) throw new Error('private-credential-detail'); return null;
      } };
      const c = connector(async () => assert.fail('Must not send'));
      const response = await app(context => relay(context, c, '/api/facilities', source, 'aedilis')).request('/relay');
      assert.equal(response.status, 503); assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.deepEqual(await response.json(), { error: 'downstream_token_unavailable', connector: 'aedilis' });
    });
  }
  it('rejects unclassified destination paths before requesting a capability', async () => {
    const source: TokenProvider = { mode: 'fixture', authorize: async () => assert.fail('Must not issue') };
    const response = await app(c => authorizedConnectorFetch(c, connector(async () => assert.fail('Must not send')), '/api/unknown', source, 'aedilis')).request('/relay');
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'downstream_operation_unclassified', connector: 'aedilis' });
  });
  it('forwards the exact prepared one-use request without rebuilding credential or body', async () => {
    const bytes = new Uint8Array([0, 255, 128, 1]); const header = `Cernere-Delegation ${'d'.repeat(43)}`;
    const source: TokenProvider = { mode: 'fixture', authorize: async (current, target, operation) => {
      assert.equal(current, session); assert.equal(target.projectKey, 'aedilis'); assert.equal(operation.action, 'reservation.capabilities');
      return { path: '/api/reservations/capabilities', init: { method: 'GET', headers: { authorization: header } } };
    } };
    const response = await app(c => authorizedConnectorFetch(c, connector(async (path, init) => {
      assert.equal(path, '/api/reservations/capabilities'); assert.equal(new Headers(init?.headers).get('authorization'), header);
      return new Response(bytes);
    }), '/api/reservations/capabilities', source, 'aedilis')).request('/relay');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  });
  it('retains streamed binary GET, Range and partial-response metadata', async () => {
    const bytes = new Uint8Array([0, 255, 128, 1]);
    const path = '/api/v1/integrations/glab/evidence/media/videos/record';
    const source: TokenProvider = { mode: 'fixture', authorize: async (_current, _target, operation) => {
      assert.equal(operation.action, 'evidence.media.read'); assert.equal(new Headers(operation.init?.headers).get('range'), 'bytes=2-5');
      assert.equal(operation.init?.body, undefined);
      return { path: operation.path, init: { ...operation.init, headers: { authorization: `Cernere-Delegation ${'d'.repeat(43)}` } } };
    } };
    const response = await app(c => proxyStream(c, connector(async (_path, init) => {
      assert.equal(init?.body, undefined); return new Response(bytes, { status: 206, headers: { 'content-range': 'bytes 2-5/6', 'content-length': '4', 'accept-ranges': 'bytes' } });
    }, 'volputas'), path, source, 'voluptas')).request('/relay', { headers: { range: 'bytes=2-5' } });
    assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 2-5/6');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  });
  it('forwards the same captured Blob above the old32MiB ceiling and disposes only after its small result', async () => {
    const body = new Blob([new Uint8Array(33 * 1024 * 1024)]), events: string[] = [];
    const upload = { body, maximumBytes: 2 * 1024 ** 3, timeoutSeconds: 300 };
    const path = '/api/v1/integrations/glab/evidence/media/videos/record';
    const source: TokenProvider = { mode: 'fixture', authorize: async (_session, _target, operation) => {
      assert.equal(operation.init?.body, body); assert.equal(operation.upload, upload);
      assert.equal(operation.action, 'evidence.media.write');
      return { path, init: { ...operation.init, headers: { authorization: `Cernere-Upload ${'u'.repeat(43)}` } }, dispose: async () => { events.push('dispose'); } };
    } };
    const response = await app(async c => {
      c.set('authorizedUploadBody', upload);
      return proxyStream(c, connector(async (_path, init) => {
        assert.equal(init?.body, body);
        assert.equal(new Headers(init?.headers).get('authorization'), `Cernere-Upload ${'u'.repeat(43)}`);
        return new Response(new ReadableStream({ start(controller) {
          events.push('result'); controller.enqueue(new TextEncoder().encode('{"ok":true}')); controller.close();
        } }), { headers: { 'content-type': 'application/json' } });
      }, 'volputas'), path, source, 'voluptas');
    }).request('/relay', { method: 'PUT', body: 'unused', headers: { 'content-type': 'video/mp4' } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(events, ['result', 'dispose']);
  });
  it('does not read or issue an upload when the classified capture is absent', async () => {
    const source: TokenProvider = { mode: 'fixture', authorize: async () => assert.fail('Must not issue') };
    const response = await app(c => proxyStream(c, connector(async () => assert.fail('Must not send'), 'volputas'),
      '/api/v1/integrations/glab/evidence/media/videos/record', source, 'voluptas')).request('/relay', { method: 'PUT', body: 'bytes' });
    assert.equal(response.status, 403);
  });
  it('waits for the outgoing reader to close before completing the upload response', async () => {
    let beginDisposal: () => void = () => assert.fail('Disposal was not initialized');
    let closeReader: () => void = () => assert.fail('Reader was not initialized');
    const disposing = new Promise<void>(resolve => { beginDisposal = resolve; });
    const closed = new Promise<void>(resolve => { closeReader = resolve; });
    const path = '/api/v1/integrations/glab/evidence/media/videos/record';
    const source: TokenProvider = { mode: 'fixture', authorize: async (_session, _target, operation) => ({
      path, init: operation.init ?? {}, dispose: async () => { beginDisposal(); await closed; },
    }) };
    let completed = false;
    const response = Promise.resolve(app(async c => {
      c.set('authorizedUploadBody', { body: new Blob(['fixed']), maximumBytes: 100, timeoutSeconds: 5 });
      return proxyStream(c, connector(async () => new Response('{"ok":true}'), 'volputas'), path, source, 'voluptas');
    }).request('/relay', { method: 'PUT', body: 'unused' })).then(result => { completed = true; return result; });
    try {
      await disposing;
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(completed, false);
    } finally { closeReader(); }
    assert.equal((await response).status, 200);
  });
  for (const failure of ['connection', 'oversize-result']) it(`releases failed upload transfer without retrying an unknown outcome (${failure})`, async () => {
    const body = new Blob(['fixed']), upload = { body, maximumBytes: 100, timeoutSeconds: 5 };
    const path = '/api/v1/integrations/glab/evidence/media/videos/record';
    let disposed = 0, sent = 0;
    const source: TokenProvider = { mode: 'fixture', authorize: async (_session, _target, operation) => ({
      path, init: operation.init ?? {}, dispose: async () => { disposed++; },
    }) };
    const response = await app(async c => {
      c.set('authorizedUploadBody', upload);
      return proxyStream(c, connector(async () => {
        sent++; if (failure === 'connection') throw new Error('unknown result');
        return new Response(new Uint8Array(65537));
      }, 'volputas'), path, source, 'voluptas');
    }).request('/relay', { method: 'PUT', body: 'unused' });
    assert.equal(response.status, 502); assert.equal((await response.json() as { outcome: string }).outcome, 'unknown');
    assert.equal(disposed, 1); assert.equal(sent, 1);
  });
  it('retains controlled authorization failure in the Aedilis event client', async () => {
    const source: TokenProvider = { mode: 'fixture', authorize: async () => null };
    const client = new AedilisEventClient(connector(async () => assert.fail('Must not send')), source);
    const response = await app(async c => {
      await assert.rejects(client.listFacilities(c), (error: unknown) => error instanceof AedilisRequestError && error.status === 503);
      return new Response('checked');
    }).request('/relay');
    assert.equal(response.status, 200);
  });
});
