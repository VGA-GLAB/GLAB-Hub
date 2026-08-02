import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  VersionedHttpServiceConnector,
  healthVersion,
} from '../plugins/service-health-connector.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('versioned service health', () => {
  it('reads top-level and wrapped versions', () => {
    assert.equal(healthVersion({ version: '1.2.3' }), '1.2.3');
    assert.equal(healthVersion({ data: { version: '4.5.6' } }), '4.5.6');
    assert.equal(healthVersion({ ok: true }), null);
  });

  it('shows the backend version in connector health', async () => {
    globalThis.fetch = async () => Response.json({
      ok: true,
      service: 'example',
      version: '2.0.0',
    });
    const connector = new VersionedHttpServiceConnector({
      id: 'example',
      title: 'Example',
      scope: 'multi',
      baseUrl: 'http://example.test/',
      healthPath: '/health',
    });

    assert.deepEqual(await connector.health(), { status: 'up', detail: 'v2.0.0' });
  });

  it('returns the parsed health payload with the probe result', async () => {
    const payload = { ok: true, version: '2.0.0', lanUrl: 'http://192.168.50.20:17590' };
    globalThis.fetch = async () => Response.json(payload);
    const connector = new VersionedHttpServiceConnector({
      id: 'ostiarius',
      title: 'Ostiarius',
      scope: 'local',
      baseUrl: 'http://localhost:17590',
      healthPath: '/api/health',
    });

    assert.deepEqual(await connector.probe(), {
      health: { status: 'up', detail: 'v2.0.0' },
      payload,
    });
  });

  it('sends the fixed connector headers on the health probe too, not only on data reads', async () => {
    // 固定 Bearer でしか認可しない接続先 (Calliope) では、health だけ無認証で送ると
    // 接続先の設定次第で probe が 401 → 常時 degraded になる。
    const seen: Array<Record<string, string>> = [];
    globalThis.fetch = async (_url, init) => {
      seen.push(Object.fromEntries(new Headers(init?.headers).entries()));
      return Response.json({ ok: true, version: '1.0.0' });
    };
    const connector = new VersionedHttpServiceConnector({
      id: 'fixed-token',
      title: 'Fixed token backend',
      scope: 'multi',
      baseUrl: 'http://fixed.test',
      healthPath: '/health',
      headers: { authorization: 'Bearer service-token' },
    });

    await connector.health();

    assert.equal(seen[0]?.authorization, 'Bearer service-token');
  });

  it('leaves requests unchanged when no fixed headers are configured', async () => {
    // 既存コネクタ (aedilis / di / tirocinium / volputas) への回帰防止。
    const seen: Array<Record<string, string>> = [];
    globalThis.fetch = async (_url, init) => {
      seen.push(Object.fromEntries(new Headers(init?.headers).entries()));
      return Response.json({ ok: true });
    };
    const connector = new VersionedHttpServiceConnector({
      id: 'plain',
      title: 'Plain',
      scope: 'multi',
      baseUrl: 'http://plain.test',
      healthPath: '/health',
    });

    await connector.fetch('/api/thing', { headers: { 'x-caller': '1' } });

    assert.deepEqual(seen[0], { 'x-caller': '1' });
  });

  it('reports explicitly when a configured backend omits its version', async () => {
    globalThis.fetch = async () => Response.json({ ok: true });
    const connector = new VersionedHttpServiceConnector({
      id: 'legacy',
      title: 'Legacy',
      scope: 'multi',
      baseUrl: 'http://legacy.test',
      healthPath: '/health',
    });

    assert.deepEqual(await connector.health(), {
      status: 'up',
      detail: 'バージョン情報なし',
    });
  });
});
