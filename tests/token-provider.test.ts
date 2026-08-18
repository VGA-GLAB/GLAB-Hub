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

  // 発行失敗は throw ではなく null + 警告になった (Corpus 62e35f6)。 宣言
  // (`Promise<string | null>`) と呼び出し側に実装を揃えたもの。 トークン
  // 無しで参照先へ進み、 参照先自身に 401/503 を返させる。 握り潰しでない
  // ことは警告が残ることで担保するので、 そこまで見る。
  it('returns null on project-token issuance failure and still reports it', async () => {
    globalThis.fetch = (async () => Response.json(
      { error: 'signing unavailable' },
      { status: 500 },
    )) as typeof fetch;

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };

    try {
      const provider = new CernereProjectTokenProvider('https://cernere.example');
      const token = await provider.getDownstreamToken('user-token', {
        service: 'volputas',
        projectKey: 'volputas',
        baseUrl: 'http://localhost:8892',
      });

      assert.equal(token, null);
      assert.ok(
        warnings.some((line) => line.includes('volputas') && line.includes('500')),
        `expected a warning naming the service and status, got ${JSON.stringify(warnings)}`,
      );
    } finally {
      console.warn = originalWarn;
    }
  });
});
