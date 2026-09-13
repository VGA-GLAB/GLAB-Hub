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

    // tokenが取れない場合は匿名で中継せず、送信前に503/no-storeを返す。
    const tokenUnavailable = await proxy(
      context() as never,
      connector(async () => assert.fail('unauthenticated request reached connector')) as never,
      '/api/v1/integrations/glab/surveys',
      {
        mode: 'test',
        async getDownstreamToken() {
          return null;
        },
      },
      'volputas',
    );
    assert.equal(tokenUnavailable.status, 503);
    assert.equal(
      tokenUnavailable.headers.get('cache-control'),
      'private, no-store',
    );
  });
});
