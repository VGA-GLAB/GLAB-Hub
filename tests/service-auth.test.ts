import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  decideServiceAuth,
  requireExternalServiceAuth,
  requireServiceToken,
  type ServiceAuthDecision,
} from '../plugins/projects/service-auth.ts';
import { verifyPasetoV4Public } from '../plugins/projects/paseto-v4-public.ts';
import {
  CernereServiceTokenVerifier,
  decideServiceClaims,
} from '../plugins/projects/service-token-verifier.ts';
import { makeSigner, publicKeyResponse, serviceClaims, signPaseto } from './paseto-fixture.ts';

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

// ─── 認証集約 P4: Cernere service token と固定トークンの両受理 ─────────────

const signer = makeSigner('v1');

function verifierWith(response: () => Promise<Response>, calls?: string[]): CernereServiceTokenVerifier {
  return new CernereServiceTokenVerifier({
    cernereBaseUrl: 'http://cernere.test/',
    audience: 'educationlab',
    fetch: (async (url: string | URL | Request) => {
      calls?.push(String(url));
      return response();
    }) as typeof fetch,
  });
}

async function runGuard(
  guard: ReturnType<typeof requireServiceToken>,
  headers: Record<string, string>,
): Promise<{ nextCalled: boolean; status: number | null; error: string | null }> {
  let nextCalled = false;
  const result = await guard(fakeContext(headers) as never, async () => { nextCalled = true; }) as FakeJsonResult | undefined;
  return {
    nextCalled,
    status: result?.status ?? null,
    error: (result?.body as { error?: string } | undefined)?.error ?? null,
  };
}

describe('requireServiceToken with Cernere service tokens', () => {
  const verifier = verifierWith(async () => publicKeyResponse(signer));

  it('accepts a valid service token in X-Glab-Service-Token without consulting the caller name', async () => {
    for (const sub of ['glab-bot', 'calliope', 'anything-else']) {
      const token = signPaseto(signer, serviceClaims({ sub }));
      const result = await runGuard(requireServiceToken('legacy-token', { verifier }), { 'x-glab-service-token': token });
      assert.equal(result.nextCalled, true, sub);
    }
  });

  it('accepts a service token in X-ProjectHub-Service-Token (the header Calliope sends today)', async () => {
    const token = signPaseto(signer, serviceClaims({ sub: 'calliope' }));
    const result = await runGuard(requireServiceToken('legacy-token', { verifier }), { 'x-projecthub-service-token': token });
    assert.equal(result.nextCalled, true);
  });

  it('accepts a service token even when the legacy fixed token is unconfigured', async () => {
    const token = signPaseto(signer, serviceClaims());
    const result = await runGuard(requireServiceToken(undefined, { verifier }), { 'x-glab-service-token': token });
    assert.equal(result.nextCalled, true);
  });

  it('returns 403 when the service token lacks glab-external:write', async () => {
    const token = signPaseto(signer, serviceClaims({ scope: ['review-relay:write'] }));
    const result = await runGuard(requireServiceToken('legacy-token', { verifier }), { 'x-glab-service-token': token });
    assert.deepEqual(result, { nextCalled: false, status: 403, error: 'insufficient_scope' });
  });

  it('returns 401 for a service token addressed elsewhere, expired, of another kind, forged or tampered', async () => {
    const tokens = [
      signPaseto(signer, serviceClaims({ aud: 'volputas' })),
      signPaseto(signer, serviceClaims({ exp: new Date(Date.now() - 1_000).toISOString() })),
      signPaseto(signer, serviceClaims({ kind: 'user_for_project' })),
      signPaseto(makeSigner('v1'), serviceClaims()),
      signPaseto(signer, serviceClaims(), null).slice(0, -8) + 'AAAAAAAA',
    ];
    for (const token of tokens) {
      const result = await runGuard(requireServiceToken('legacy-token', { verifier }), { 'x-glab-service-token': token });
      assert.deepEqual(result, { nextCalled: false, status: 401, error: 'invalid_service_token' });
    }
  });

  it('does not fall back to the legacy comparison when a service token is rejected', async () => {
    // v4.public 値は固定トークン照合へ回さない (固定トークン側の値と偶然一致しても通さない)。
    const token = signPaseto(signer, serviceClaims({ aud: 'volputas' }));
    const result = await runGuard(requireServiceToken(token, { verifier }), { 'x-glab-service-token': token });
    assert.equal(result.status, 401);
  });

  it('keeps accepting the legacy fixed token alongside the verifier', async () => {
    const guard = requireServiceToken('legacy-token', { verifier });
    assert.equal((await runGuard(guard, { 'x-glab-service-token': 'legacy-token' })).nextCalled, true);
    assert.equal((await runGuard(guard, { 'x-projecthub-service-token': 'legacy-token' })).nextCalled, true);
    assert.equal((await runGuard(guard, { authorization: 'Bearer legacy-token' })).nextCalled, true);
    assert.equal((await runGuard(guard, { 'x-glab-service-token': 'wrong' })).status, 401);
  });

  it('does not treat the Authorization bearer (the user-token slot) as a service token', async () => {
    const token = signPaseto(signer, serviceClaims());
    const result = await runGuard(requireServiceToken('legacy-token', { verifier }), { authorization: `Bearer ${token}` });
    assert.deepEqual(result, { nextCalled: false, status: 401, error: 'invalid_service_token' });
  });

  it('stays fail-closed when neither credential is presented', async () => {
    assert.equal((await runGuard(requireServiceToken('legacy-token', { verifier }), {})).status, 401);
    assert.equal((await runGuard(requireServiceToken(undefined, { verifier }), {})).status, 503);
  });

  it('returns 503 when the Cernere public key cannot be fetched', async () => {
    const down = verifierWith(async () => { throw new Error('ECONNREFUSED'); });
    const token = signPaseto(signer, serviceClaims());
    const result = await runGuard(requireServiceToken('legacy-token', { verifier: down }), { 'x-glab-service-token': token });
    assert.deepEqual(result, { nextCalled: false, status: 503, error: 'service_token_verifier_unavailable' });
  });

  it('caches the public key and does not refetch within the minimum interval', async () => {
    const calls: string[] = [];
    const cached = verifierWith(async () => publicKeyResponse(signer), calls);
    assert.equal((await cached.verify(signPaseto(signer, serviceClaims()), 'glab-external:write')).status, 'ok');
    assert.equal((await cached.verify(signPaseto(signer, serviceClaims()), 'glab-external:write')).status, 'ok');
    // 未知 kid でも再取得の最小間隔 (30 秒) 内なら Cernere を叩かない。
    assert.equal((await cached.verify(signPaseto(makeSigner('v2'), serviceClaims()), 'glab-external:write')).status, 'invalid');
    assert.deepEqual(calls, ['http://cernere.test/.well-known/cernere-public-key']);
  });

  it('builds the guard for every /external route from env (CERNERE_BASE_URL + audience)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => publicKeyResponse(signer)) as typeof fetch;
    try {
      const env = (values: Record<string, string>) => (key: string): string | undefined => values[key];
      const guard = requireExternalServiceAuth(env({
        CERNERE_BASE_URL: 'http://cernere-env.test',
        GLAB_SERVICE_TOKEN_AUDIENCE: 'glab_custom',
        GLAB_PROJECTS_SERVICE_TOKEN: 'legacy-token',
      }));
      const token = signPaseto(signer, serviceClaims({ aud: 'glab_custom' }));
      assert.equal((await runGuard(guard, { 'x-glab-service-token': token })).nextCalled, true);
      assert.equal((await runGuard(guard, { 'x-glab-service-token': 'legacy-token' })).nextCalled, true);

      // Cernere 未設定なら v4.public 値も固定トークン照合へ回り、 不一致で 401。
      const legacyOnly = requireExternalServiceAuth(env({ GLAB_PROJECTS_SERVICE_TOKEN: 'legacy-token' }));
      assert.equal((await runGuard(legacyOnly, { 'x-glab-service-token': token })).status, 401);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('applies the shared guard on consult, projects and tech-links /external routes', async () => {
    for (const file of ['plugins/consult/index.ts', 'plugins/projects/index.ts', 'plugins/tech-links/index.ts']) {
      const src = await readFile(file, 'utf8');
      assert.match(src, /requireExternalServiceAuth\(ctx\.env\)/, file);
      assert.doesNotMatch(src, /requireServiceToken\(serviceToken/, file);
    }
  });
});

describe('service token decisions', () => {
  const now = Date.parse('2026-10-05T00:00:00.000Z');

  it('decideServiceClaims checks kind, sub, scope shape, aud, exp and the required scope', () => {
    const base = serviceClaims({}, now);
    const scope = 'glab-external:write';
    assert.equal(decideServiceClaims(base, 'educationlab', scope, now), 'ok');
    assert.equal(decideServiceClaims(base, 'educationlab', 'calliope-api:access', now), 'insufficient_scope');
    assert.equal(decideServiceClaims(base, 'volputas', scope, now), 'invalid');
    assert.equal(decideServiceClaims(base, '', scope, now), 'invalid');
    assert.equal(decideServiceClaims({ ...base, kind: 'user_for_project' }, 'educationlab', scope, now), 'invalid');
    assert.equal(decideServiceClaims({ ...base, scope }, 'educationlab', scope, now), 'invalid');
    assert.equal(decideServiceClaims({ ...base, sub: '' }, 'educationlab', scope, now), 'invalid');
    assert.equal(decideServiceClaims(base, 'educationlab', scope, now + 16 * 60_000), 'invalid');
  });

  it('decideServiceAuth prefers the service-token verdict and otherwise compares the fixed token', () => {
    const cases: Array<[Parameters<typeof decideServiceAuth>, ServiceAuthDecision]> = [
      [['v4.public.x', 'legacy', { status: 'ok', subject: 'calliope' }], { allow: true }],
      [['v4.public.x', 'legacy', { status: 'insufficient_scope' }], { allow: false, status: 403, error: 'insufficient_scope' }],
      [['v4.public.x', 'legacy', { status: 'invalid' }], { allow: false, status: 401, error: 'invalid_service_token' }],
      [['v4.public.x', 'legacy', { status: 'unavailable' }], { allow: false, status: 503, error: 'service_token_verifier_unavailable' }],
      [['legacy', 'legacy', null], { allow: true }],
      [['nope', 'legacy', null], { allow: false, status: 401, error: 'invalid_service_token' }],
      [[null, 'legacy', null], { allow: false, status: 401, error: 'invalid_service_token' }],
      [['legacy', '  ', null], { allow: false, status: 503, error: 'service_token_unconfigured' }],
    ];
    for (const [args, expected] of cases) assert.deepEqual(decideServiceAuth(...args), expected);
  });

  it('verifyPasetoV4Public returns claims only for a signature made by a supplied key', () => {
    const claims = serviceClaims({}, now);
    const keys = [{ kid: 'v1', publicKey: signer.publicKeyRaw }];
    assert.deepEqual(verifyPasetoV4Public(signPaseto(signer, claims), keys), claims);
    // footer 無しでも全鍵を試して通す。
    assert.deepEqual(verifyPasetoV4Public(signPaseto(signer, claims, null), keys), claims);
    assert.equal(verifyPasetoV4Public(signPaseto(makeSigner('v1'), claims), keys), null);
    assert.equal(verifyPasetoV4Public(signPaseto(signer, claims, 'unknown-kid'), keys), null);
    assert.equal(verifyPasetoV4Public('v4.local.abc', keys), null);
    assert.equal(verifyPasetoV4Public('legacy-token', keys), null);
  });
});
