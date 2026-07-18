import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requireServiceToken } from '../plugins/projects/service-auth.ts';

interface FakeJsonResult {
  body: unknown;
  status: number;
}

/** requireServiceToken が触れる Hono Context の最小形だけを実装するフェイク。 */
function fakeContext(headers: Record<string, string>): {
  req: { header(name: string): string | undefined };
  json(body: unknown, status: number): FakeJsonResult;
} {
  return {
    req: { header: (name: string) => headers[name.toLowerCase()] },
    json: (body: unknown, status: number) => ({ body, status }),
  };
}

describe('requireServiceToken', () => {
  it('returns 503 without calling next when the token is unconfigured', async () => {
    const guard = requireServiceToken(undefined);
    let nextCalled = false;
    const result = await guard(fakeContext({}) as never, async () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal((result as FakeJsonResult).status, 503);
    assert.equal((result as FakeJsonResult & { body: { error: string } }).body.error, 'service_token_unconfigured');
  });

  it('returns 401 when no token is presented', async () => {
    const guard = requireServiceToken('secret-token');
    let nextCalled = false;
    const result = await guard(fakeContext({}) as never, async () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal((result as FakeJsonResult).status, 401);
  });

  it('returns 401 when the presented token does not match', async () => {
    const guard = requireServiceToken('secret-token');
    let nextCalled = false;
    const result = await guard(
      fakeContext({ 'x-glab-service-token': 'wrong-token' }) as never,
      async () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, false);
    assert.equal((result as FakeJsonResult).status, 401);
  });

  it('calls next when X-Glab-Service-Token matches', async () => {
    const guard = requireServiceToken('secret-token');
    let nextCalled = false;
    await guard(fakeContext({ 'x-glab-service-token': 'secret-token' }) as never, async () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
  });

  it('accepts the token via a Bearer Authorization header', async () => {
    const guard = requireServiceToken('secret-token');
    let nextCalled = false;
    await guard(
      fakeContext({ authorization: 'Bearer secret-token' }) as never,
      async () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
  });
});
