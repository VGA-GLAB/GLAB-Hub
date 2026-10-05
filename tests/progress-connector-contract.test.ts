import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, it } from 'node:test';
import {
  CALLIOPE_CONNECTOR_ID,
  CALLIOPE_PROGRESS_PATH,
  calliopeConnectorOptions,
  makeCalliopeConnector,
} from '../plugins/progress/connector.ts';
import { readProgress } from '../plugins/progress/relay.ts';
import { VersionedHttpServiceConnector } from '../plugins/service-health-connector.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const env = (values: Record<string, string>) => (key: string): string | undefined => values[key];

function connector(fetchImpl: (path: string) => Promise<Response>) {
  return {
    id: CALLIOPE_CONNECTOR_ID,
    title: 'PM進捗 (Calliope)',
    scope: 'multi' as const,
    baseUrl: 'http://calliope.test',
    async health() {
      return { status: 'up' as const };
    },
    fetch: (path: string) => fetchImpl(path),
  };
}

describe('Calliope connector configuration', () => {
  it('carries no credential in the static connector options (data requests get it per call)', () => {
    const options = calliopeConnectorOptions(env({
      CALLIOPE_BASE_URL: 'http://calliope.test/',
      CALLIOPE_SERVICE_TOKEN: 'service-token',
    }));

    assert.equal(options.id, 'calliope');
    assert.equal(options.scope, 'multi');
    assert.deepEqual(options.headers, {});
  });

  it('probes the unauthenticated /health route, not /api/health', () => {
    // Calliope は /api/* だけを apiAuth で守る。 /health は token 無しで到達できる。
    assert.equal(calliopeConnectorOptions(env({})).healthPath, '/health');
  });

  it('treats a missing or blank base URL as an intentionally unconfigured connector', () => {
    assert.equal(calliopeConnectorOptions(env({})).baseUrl, '');
    assert.equal(calliopeConnectorOptions(env({ CALLIOPE_BASE_URL: '   ' })).baseUrl, '');
  });

  it('reports degraded instead of down while Calliope is unconfigured', async () => {
    const calliope = makeCalliopeConnector(env({}));
    assert.equal((await calliope.health()).status, 'degraded');
  });

  it('sends the legacy fixed token on data reads while Cernere credentials are not injected', async () => {
    const seen: Array<Record<string, string>> = [];
    globalThis.fetch = async (_url, init) => {
      seen.push(Object.fromEntries(new Headers(init?.headers).entries()));
      return Response.json({ generatedAt: 'now', projects: [] });
    };
    const calliope = makeCalliopeConnector(env({
      CALLIOPE_BASE_URL: 'http://calliope.test',
      CALLIOPE_SERVICE_TOKEN: 'service-token',
    }));

    await calliope.fetch(CALLIOPE_PROGRESS_PATH);

    assert.equal(seen[0]?.authorization, 'Bearer service-token');
  });

  it('keeps Calliope on its machine credential even if a caller supplies another token', async () => {
    // Calliope は user-token proxy とは異なる機械 credential 経路。
    const seen: Array<Record<string, string>> = [];
    globalThis.fetch = async (_url, init) => {
      seen.push(Object.fromEntries(new Headers(init?.headers).entries()));
      return Response.json({});
    };
    const calliope = makeCalliopeConnector(env({
      CALLIOPE_BASE_URL: 'http://calliope.test',
      CALLIOPE_SERVICE_TOKEN: 'service-token',
    }));

    await calliope.fetch(CALLIOPE_PROGRESS_PATH, {
      headers: { Authorization: 'Bearer downstream-token' },
    });

    assert.equal(seen[0]?.authorization, 'Bearer service-token');
  });
});

describe('Calliope connector with Cernere service tokens (auth P4)', () => {
  const CERNERE_ENV = {
    CALLIOPE_BASE_URL: 'http://calliope.test',
    CERNERE_BASE_URL: 'http://cernere.test',
    CERNERE_PROJECT_CLIENT_ID: 'client-id',
    CERNERE_PROJECT_CLIENT_SECRET: 'client-secret',
    CALLIOPE_PROJECT_KEY: 'Calliope',
  };

  function recordFetch(issue: () => Response) {
    const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    globalThis.fetch = async (url, init) => {
      calls.push({
        url: String(url),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (String(url).endsWith('/api/auth/service-token')) return issue();
      return Response.json({ generatedAt: 'now', projects: [] });
    };
    return calls;
  }

  it('sends a Cernere service token issued for CALLIOPE_PROJECT_KEY as the Bearer', async () => {
    const calls = recordFetch(() => Response.json({ accessToken: 'v4.public.calliope', expiresIn: 900 }));
    const calliope = makeCalliopeConnector(env({ ...CERNERE_ENV, CALLIOPE_SERVICE_TOKEN: 'service-token' }));

    await calliope.fetch(CALLIOPE_PROGRESS_PATH);
    await calliope.fetch(CALLIOPE_PROGRESS_PATH);

    const issued = calls.filter((c) => c.url.endsWith('/api/auth/service-token'));
    assert.equal(issued.length, 1, 'the token is cached between requests');
    assert.equal(issued[0]?.url, 'http://cernere.test/api/auth/service-token');
    assert.deepEqual(issued[0]?.body, {
      client_id: 'client-id',
      client_secret: 'client-secret',
      target_project_key: 'Calliope',
    });
    const reads = calls.filter((c) => c.url.startsWith('http://calliope.test'));
    assert.equal(reads.length, 2);
    for (const read of reads) assert.equal(read.headers.authorization, 'Bearer v4.public.calliope');
    // client credentials は Cernere 以外へ送らない。
    for (const read of reads) assert.equal(JSON.stringify(read).includes('client-secret'), false);
  });

  it('falls back to CALLIOPE_SERVICE_TOKEN only when issuance fails', async () => {
    const calls = recordFetch(() => new Response('', { status: 403 }));
    const calliope = makeCalliopeConnector(env({ ...CERNERE_ENV, CALLIOPE_SERVICE_TOKEN: 'service-token' }));

    await calliope.fetch(CALLIOPE_PROGRESS_PATH);

    const read = calls.find((c) => c.url.startsWith('http://calliope.test'));
    assert.equal(read?.headers.authorization, 'Bearer service-token');
  });

  it('falls back when CALLIOPE_PROJECT_KEY is not set, without calling Cernere', async () => {
    const calls = recordFetch(() => Response.json({ accessToken: 'unused', expiresIn: 900 }));
    const { CALLIOPE_PROJECT_KEY: _omitted, ...withoutKey } = CERNERE_ENV;
    const calliope = makeCalliopeConnector(env({ ...withoutKey, CALLIOPE_SERVICE_TOKEN: 'service-token' }));

    await calliope.fetch(CALLIOPE_PROGRESS_PATH);

    assert.equal(calls.some((c) => c.url.includes('cernere')), false);
    assert.equal(calls[0]?.headers.authorization, 'Bearer service-token');
  });

  it('returns 503 without reaching Calliope when issuance fails and no fixed token is set', async () => {
    const calls = recordFetch(() => new Response('', { status: 401 }));
    const calliope = makeCalliopeConnector(env(CERNERE_ENV));

    const res = await calliope.fetch(CALLIOPE_PROGRESS_PATH);

    assert.equal(res.status, 503);
    assert.equal((await res.json() as { error: string }).error, 'service_token_unavailable');
    assert.equal(calls.some((c) => c.url.startsWith('http://calliope.test')), false);
  });

  it('never sends a credential on the public health probe', async () => {
    const calls = recordFetch(() => Response.json({ accessToken: 'v4.public.calliope', expiresIn: 900 }));
    await makeCalliopeConnector(env({ ...CERNERE_ENV, CALLIOPE_SERVICE_TOKEN: 'service-token' })).health();
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, 'http://calliope.test/health');
    assert.equal(calls[0]?.headers.authorization, undefined);
  });
});

describe('progress relay', () => {
  it('reads the Calliope progress API and forwards the project filter', async () => {
    const requested: string[] = [];
    const res = await readProgress(
      connector(async (path) => {
        requested.push(path);
        return Response.json({ generatedAt: '2026-07-31T00:00:00.000Z', projects: [] });
      }) as never,
      '?project_id=p1',
    );

    assert.deepEqual(requested, ['/api/glab/progress?project_id=p1']);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { generatedAt: '2026-07-31T00:00:00.000Z', projects: [] });
  });

  it('never caches the relayed progress report', async () => {
    const res = await readProgress(
      connector(async () => new Response('{}', {
        headers: { 'cache-control': 'public, max-age=600', 'content-type': 'application/json' },
      })) as never,
    );

    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  });

  it('bounds the upstream wait so an unresponsive Calliope cannot pin the hub request', async () => {
    // コネクタは data 取得に独自タイムアウトを課さないので、 relay が signal を渡す。
    let seenInit: RequestInit | undefined;
    const res = await readProgress({
      ...connector(async () => Response.json({})),
      fetch: async (_path: string, init?: RequestInit) => {
        seenInit = init;
        return Response.json({ generatedAt: 'now', projects: [] });
      },
    } as never);

    assert.equal(res.status, 200);
    assert.ok(seenInit?.signal instanceof AbortSignal, 'relay must pass an abort signal');
    assert.equal(seenInit?.signal?.aborted, false);
  });

  it('passes an unconfigured connector 503 through so the panel degrades', async () => {
    const calliope = new VersionedHttpServiceConnector({
      ...calliopeConnectorOptions(env({})),
    });

    const res = await readProgress(calliope, '');

    assert.equal(res.status, 503);
    assert.equal((await res.json() as { error: string }).error, 'connector_unconfigured');
  });

  it('maps an unreachable Calliope to 502 instead of throwing a 500', async () => {
    const res = await readProgress(
      connector(async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:8891');
      }) as never,
    );

    assert.equal(res.status, 502);
    const body = await res.json() as { error: string; connector: string };
    assert.equal(body.error, 'connector_error');
    assert.equal(body.connector, 'calliope');
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  });

  it('passes Calliope prerequisite errors through untouched', async () => {
    // Calliope が上流未設定を 503 unconfigured / 400 で表明するケース。
    // GLAB 側で握り潰して 200 にしない。
    const res = await readProgress(
      connector(async () => Response.json(
        { error: 'glab_progress_prerequisites_missing', missing: ['glab', 'actio'] },
        { status: 400 },
      )) as never,
    );

    assert.equal(res.status, 400);
    assert.deepEqual(
      (await res.json() as { missing: string[] }).missing,
      ['glab', 'actio'],
    );
  });
});

describe('progress module contract', () => {
  const source = (path: string): Promise<string> => readFile(path, 'utf8');

  it('is registered in the plugin pack and the panel build', async () => {
    const [packText, packageText] = await Promise.all([
      source('plugins/pack.json'),
      source('package.json'),
    ]);
    const pack = JSON.parse(packText) as { modules?: string[] };
    const pkg = JSON.parse(packageText) as { scripts?: Record<string, string> };

    assert.equal(pack.modules?.filter((module) => module === 'progress').length, 1);
    assert.match(pkg.scripts?.['build:panels'] ?? '', /plugins\/progress\/panel\.ts/);
  });

  it('adds Calliope to the built-in status overview by registering a connector', async () => {
    const module = await source('plugins/progress/index.ts');
    assert.match(module, /ctx\.registerConnector\(calliope\)/);
    assert.equal((module.match(/registerPanel\s*\(/g) ?? []).length, 1);
  });

  it('keeps the engine in Calliope — no GLAB-side schema or persistence', async () => {
    const [module, relay, view, dataLayer] = await Promise.all([
      source('plugins/progress/index.ts'),
      source('plugins/progress/relay.ts'),
      source('plugins/progress/progress-view.ts'),
      source('plugins/data.ts'),
    ]);

    for (const file of [module, relay, view]) {
      assert.doesNotMatch(file, /CREATE TABLE/i);
      assert.doesNotMatch(file, /from '\.\.\/data\.ts'/);
    }
    // 進捗を GLAB の DB に持たない担保。 `in_progress` のような無関係なステータス値まで
    // 巻き込まないよう、 進捗用テーブルの有無だけを見る。
    assert.doesNotMatch(dataLayer, /CREATE TABLE[^;]*progress/i);
  });

  it('reads the progress route through the module mount point', async () => {
    const panel = await source('plugins/progress/panel.ts');
    assert.match(panel, /ctx\.api\('\/progress'\)/);
    assert.match(panel, /connectorGuard\(res, SERVICE_LABEL\)/);
  });

  it('gates on the Vantan profile registration like every other GLAB panel', async () => {
    const panel = await source('plugins/progress/panel.ts');
    assert.match(panel, /await requireVantanUserRegistration\(container, ctx\)/);
  });
});
