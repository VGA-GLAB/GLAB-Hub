import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { proxy } from '../plugins/shared.ts';

function context() {
  return {
    req: {
      method: 'GET',
      url: 'http://glab.test/api/x/volputas/surveys',
      async text() {
        return '';
      },
      header() {
        return undefined;
      },
    },
    get(key: string) {
      return key === 'userToken' ? 'user-access-token' : undefined;
    },
  };
}

function connector(fetchImpl: () => Promise<Response>) {
  return {
    id: 'volputas',
    title: 'Volputas',
    scope: 'multi',
    baseUrl: 'http://volputas.test',
    async health() {
      return { status: 'up' };
    },
    fetch: fetchImpl,
  };
}

describe('authenticated plugin proxy cache policy', () => {
  it('overrides a cacheable downstream response with private no-store', async () => {
    const response = await proxy(
      context() as never,
      connector(async () => new Response('sensitive-answer', {
        headers: {
          'cache-control': 'public, max-age=3600',
          'content-type': 'application/json',
        },
      })) as never,
      '/api/v1/integrations/glab/surveys',
      {
        mode: 'test',
        async getDownstreamToken() {
          return 'project-token';
        },
      },
      'volputas',
    );

    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(await response.text(), 'sensitive-answer');
  });

  it('marks connector and token failures private and no-store', async () => {
    const connectorFailure = await proxy(
      context() as never,
      connector(async () => {
        throw new Error('offline');
      }) as never,
      '/api/v1/integrations/glab/surveys',
      {
        mode: 'test',
        async getDownstreamToken() {
          return 'project-token';
        },
      },
      'volputas',
    );
    assert.equal(
      connectorFailure.headers.get('cache-control'),
      'private, no-store',
    );

    // token が取れないときは TokenProvider が null を返し (Corpus 62e35f6 で
    // throw を廃止)、 トークン無しのまま参照先へ進む。 参照先が返す 401 は
    // ユーザ固有の応答なので、 参照先が長い max-age を付けていても
    // no-store で上書きされていなければならない。
    const tokenUnavailable = await proxy(
      context() as never,
      connector(async () => new Response('unauthorized', {
        status: 401,
        headers: { 'cache-control': 'public, max-age=3600' },
      })) as never,
      '/api/v1/integrations/glab/surveys',
      {
        mode: 'test',
        async getDownstreamToken() {
          return null;
        },
      },
      'volputas',
    );
    assert.equal(tokenUnavailable.status, 401);
    assert.equal(
      tokenUnavailable.headers.get('cache-control'),
      'private, no-store',
    );
  });
});
