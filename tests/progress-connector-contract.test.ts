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
  it('authenticates with the fixed service token rather than a user token', () => {
    const options = calliopeConnectorOptions(env({
      CALLIOPE_BASE_URL: 'http://calliope.test/',
      CALLIOPE_SERVICE_TOKEN: 'service-token',
    }));

    assert.equal(options.id, 'calliope');
    assert.equal(options.scope, 'multi');
    assert.deepEqual(options.headers, { authorization: 'Bearer service-token' });
  });

  it('probes the unauthenticated /health route, not /api/health', () => {
    // Calliope は /api/* だけを apiAuth で守る。 /health は token 無しで到達できる。
    assert.equal(calliopeConnectorOptions(env({})).healthPath, '/health');
  });

  it('treats a missing or blank base URL as an intentionally unconfigured connector', () => {
    assert.equal(calliopeConnectorOptions(env({})).baseUrl, '');
    assert.equal(calliopeConnectorOptions(env({ CALLIOPE_BASE_URL: '   ' })).baseUrl, '');
  });

  it('omits the Authorization header when no service token is configured', () => {
    const options = calliopeConnectorOptions(env({ CALLIOPE_BASE_URL: 'http://calliope.test' }));
    assert.deepEqual(options.headers, {});
  });

  it('reports degraded instead of down while Calliope is unconfigured', async () => {
    const calliope = makeCalliopeConnector(env({}));
    assert.equal((await calliope.health()).status, 'degraded');
  });

  it('sends the service token on data reads', async () => {
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

  it('lets a caller-supplied header win over the fixed connector header', async () => {
    // proxy() 系コネクタが乗せるユーザ単位トークンを固定ヘッダで潰さない契約。
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

    assert.equal(seen[0]?.authorization, 'Bearer downstream-token');
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
