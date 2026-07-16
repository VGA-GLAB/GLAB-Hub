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
