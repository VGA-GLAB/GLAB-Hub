import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { CernereProjectTokenProvider } from '../corpus/server/hub/tokens.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('CernereProjectTokenProvider', () => {
  it('removes trailing slashes from the project-token audience URL', async () => {
    let requestBody: unknown;
    globalThis.fetch = (async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return Response.json({ accessToken: 'project-token', expiresIn: 900 });
    }) as typeof fetch;

    const provider = new CernereProjectTokenProvider('https://cernere.example');
    const token = await provider.getDownstreamToken('user-token', {
      service: 'volputas',
      projectKey: 'volputas',
      baseUrl: 'http://localhost:8892/',
    });

    assert.equal(token, 'project-token');
    assert.deepEqual(requestBody, {
      project_key: 'volputas',
      hub_url: 'http://localhost:8892',
    });
  });

  it('reports project-token issuance failures instead of silently dropping auth', async () => {
    globalThis.fetch = (async () => Response.json(
      { error: 'signing unavailable' },
      { status: 500 },
    )) as typeof fetch;

    const provider = new CernereProjectTokenProvider('https://cernere.example');
    await assert.rejects(
      provider.getDownstreamToken('user-token', {
        service: 'volputas',
        projectKey: 'volputas',
        baseUrl: 'http://localhost:8892',
      }),
      /project-token unavailable for volputas \(500\)/,
    );
  });
});
