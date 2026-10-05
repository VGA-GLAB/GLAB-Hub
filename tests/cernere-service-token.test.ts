import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  CernereServiceTokenSource,
  serviceTokenCacheDeadline,
  serviceTokenFailureFromStatus,
} from '../plugins/cernere-service-token.ts';
import { makeSenderCredentialProvider, selectSenderCredential } from '../plugins/service-credential.ts';
import { glabConfigured, glabExternal } from '../bot/glab-api.ts';
import type { BotConfig } from '../bot/config.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const CREDENTIALS = {
  cernereBaseUrl: 'http://cernere.test/',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  targetProjectKey: 'EducationLab',
};

function issuer(responses: Array<() => Response | Promise<Response>>, requests: Array<{ url: string; body: unknown }>) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    const next = responses.shift();
    if (!next) throw new Error('unexpected Cernere call');
    return next();
  }) as typeof fetch;
}

describe('CernereServiceTokenSource', () => {
  it('posts the project client credentials to Cernere only and returns the access token', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const source = new CernereServiceTokenSource(CREDENTIALS, {
      fetch: issuer([() => Response.json({ tokenType: 'service', accessToken: 'mock-issued', expiresIn: 900 })], requests),
    });

    assert.deepEqual(await source.getToken(), { ok: true, token: 'mock-issued' });
    assert.deepEqual(requests, [{
      url: 'http://cernere.test/api/auth/service-token',
      body: { client_id: 'client-id', client_secret: 'client-secret', target_project_key: 'EducationLab' },
    }]);
  });

  it('reuses the token until exp - 60s and then reissues', async () => {
    let now = 1_000_000;
    const requests: Array<{ url: string; body: unknown }> = [];
    const source = new CernereServiceTokenSource(CREDENTIALS, {
      now: () => now,
      fetch: issuer([
        () => Response.json({ accessToken: 'first', expiresIn: 900 }),
        () => Response.json({ accessToken: 'second', expiresIn: 900 }),
      ], requests),
    });

    assert.deepEqual(await source.getToken(), { ok: true, token: 'first' });
    now += 839_000;
    assert.deepEqual(await source.getToken(), { ok: true, token: 'first' });
    now += 1_000; // = 発行 + 900s - 60s
    assert.deepEqual(await source.getToken(), { ok: true, token: 'second' });
    assert.equal(requests.length, 2);
  });

  it('shares one in-flight issuance between concurrent callers', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const source = new CernereServiceTokenSource(CREDENTIALS, {
      fetch: issuer([() => Response.json({ accessToken: 'once', expiresIn: 900 })], requests),
    });
    const results = await Promise.all([source.getToken(), source.getToken(), source.getToken()]);
    assert.ok(results.every((r) => r.ok && r.token === 'once'));
    assert.equal(requests.length, 1);
  });

  it('never calls Cernere without complete credentials or a target project key', async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = issuer([], requests);
    assert.deepEqual(
      await new CernereServiceTokenSource({ ...CREDENTIALS, clientSecret: ' ' }, { fetch: fetchImpl }).getToken(),
      { ok: false, reason: 'credentials_missing' },
    );
    assert.deepEqual(
      await new CernereServiceTokenSource({ ...CREDENTIALS, targetProjectKey: undefined }, { fetch: fetchImpl }).getToken(),
      { ok: false, reason: 'target_missing' },
    );
    assert.equal(requests.length, 0);
  });

  it('maps issuance failures to reason codes and backs off before retrying', async () => {
    assert.equal(serviceTokenFailureFromStatus(401), 'unauthorized');
    assert.equal(serviceTokenFailureFromStatus(403), 'scope_undeclared');
    assert.equal(serviceTokenFailureFromStatus(404), 'target_not_found');
    assert.equal(serviceTokenFailureFromStatus(503), 'issuer_unavailable');
    assert.equal(serviceTokenFailureFromStatus(500), 'issuer_error');

    let now = 0;
    const requests: Array<{ url: string; body: unknown }> = [];
    const source = new CernereServiceTokenSource(CREDENTIALS, {
      now: () => now,
      fetch: issuer([
        () => new Response('', { status: 403 }),
        () => { throw new Error('ECONNREFUSED'); },
        () => Response.json({ accessToken: '', expiresIn: 900 }),
      ], requests),
    });
    assert.deepEqual(await source.getToken(), { ok: false, reason: 'scope_undeclared' });
    assert.deepEqual(await source.getToken(), { ok: false, reason: 'scope_undeclared' });
    assert.equal(requests.length, 1);
    now += 30_000;
    assert.deepEqual(await source.getToken(), { ok: false, reason: 'network' });
    now += 30_000;
    assert.deepEqual(await source.getToken(), { ok: false, reason: 'malformed_response' });
  });

  it('caches for exactly expiresIn minus 60 seconds', () => {
    assert.equal(serviceTokenCacheDeadline(1_000, 900), 1_000 + 840_000);
  });
});

describe('sender credential selection (P4 fallback)', () => {
  it('prefers the service token and falls back to the fixed token only when issuance fails', () => {
    assert.deepEqual(selectSenderCredential({ ok: true, token: 'svc' }, 'legacy'), { kind: 'service_token', token: 'svc' });
    assert.deepEqual(selectSenderCredential({ ok: false, reason: 'unauthorized' }, ' legacy '), { kind: 'legacy', token: 'legacy', reason: 'unauthorized' });
    assert.deepEqual(selectSenderCredential({ ok: false, reason: 'network' }, '  '), { kind: 'none', reason: 'network' });
    assert.deepEqual(selectSenderCredential({ ok: false, reason: 'credentials_missing' }, undefined), { kind: 'none', reason: 'credentials_missing' });
  });

  it('logs the reason code once per change and never the secret values', async () => {
    const lines: string[] = [];
    const provider = makeSenderCredentialProvider({
      label: 'calliope',
      source: new CernereServiceTokenSource({ ...CREDENTIALS, clientSecret: '' }),
      legacyToken: 'super-secret-legacy',
      log: (line) => lines.push(line),
    });
    assert.equal((await provider()).kind, 'legacy');
    assert.equal((await provider()).kind, 'legacy');
    assert.equal(lines.length, 1);
    assert.match(lines[0] ?? '', /reason=credentials_missing/);
    assert.doesNotMatch(lines[0] ?? '', /super-secret-legacy|client-id/);
  });
});

describe('bot GLAB external client', () => {
  function botConfig(overrides: Partial<BotConfig> = {}): BotConfig {
    return {
      glabBaseUrl: 'http://glab.test/',
      glabServiceToken: 'legacy-token',
      cernere: { baseUrl: 'http://cernere.test', clientId: 'client-id', clientSecret: 'client-secret' },
      ...overrides,
    } as BotConfig;
  }

  it('sends a Cernere service token for EducationLab in X-Glab-Service-Token', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (String(url).endsWith('/api/auth/service-token')) return Response.json({ accessToken: 'v4.public.bot', expiresIn: 900 });
      return Response.json({ consults: [] });
    }) as typeof fetch;

    const cfg = botConfig();
    const result = await glabExternal(cfg, '/external/consults/pending');
    await glabExternal(cfg, '/external/consults/pending');

    assert.deepEqual(result, { ok: true, data: { consults: [] } });
    assert.equal(calls.filter((c) => c.url.endsWith('/api/auth/service-token')).length, 1);
    assert.deepEqual(calls[0]?.body, { client_id: 'client-id', client_secret: 'client-secret', target_project_key: 'EducationLab' });
    const hubCall = calls[1];
    assert.equal(hubCall?.url, 'http://glab.test/api/x/consult/external/consults/pending');
    assert.equal(hubCall?.headers['x-glab-service-token'], 'v4.public.bot');
    assert.equal(hubCall?.headers.authorization, undefined);
  });

  it('falls back to GLAB_PROJECTS_SERVICE_TOKEN only when issuance fails', async () => {
    const hubHeaders: Array<Record<string, string>> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).endsWith('/api/auth/service-token')) return new Response('', { status: 401 });
      hubHeaders.push(Object.fromEntries(new Headers(init?.headers).entries()));
      return Response.json(null);
    }) as typeof fetch;

    const result = await glabExternal(botConfig(), '/external/presence/resolve', { method: 'POST', body: { discordId: '1' } });
    assert.deepEqual(result, { ok: true, data: null });
    assert.equal(hubHeaders[0]?.['x-glab-service-token'], 'legacy-token');
  });

  it('does not call the hub when neither credential is available', async () => {
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return Response.json({}); }) as typeof fetch;
    const cfg = botConfig({ glabServiceToken: '', cernere: { baseUrl: '', clientId: '', clientSecret: '' } });
    assert.equal(glabConfigured(cfg), false);
    assert.deepEqual(await glabExternal(cfg, '/external/consults/pending'), { ok: false, status: null });
    assert.equal(calls, 0);
  });

  it('treats Cernere credentials alone as a configured GLAB link', () => {
    assert.equal(glabConfigured(botConfig({ glabServiceToken: '' })), true);
    assert.equal(glabConfigured(botConfig({ glabBaseUrl: '' })), false);
  });
});
