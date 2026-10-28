import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Hono } from '../corpus/server/hub/sdk.ts';
import { installPublicReadRoutes } from '../corpus/server/public-read-routes.ts';
import { createPublicLegalRoutes } from '../plugins/legal/public-routes.ts';

test('legal HTML is anonymous and fixed-path; protected APIs remain protected', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'glab-legal-'));
  try {
    const html = '<!doctype html><html lang="ja"><title>Privacy fixture</title></html>';
    writeFileSync(join(directory, 'privacy.html'), html);
    const app = new Hono();
    installPublicReadRoutes(app, createPublicLegalRoutes(directory));
    app.use('/api/*', c => c.json({ error: 'unauthorized' }, 401));
    const response = await app.request('/public/legal/privacy?file=terms.html');
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('location'), null);
    assert.match(response.headers.get('content-security-policy') ?? '', /default-src 'none'/);
    assert.equal((await app.request('/api/private')).status, 401);
    assert.equal((await app.request('/public/legal/privacy', { method: 'POST' })).status, 405);
    assert.equal((await app.request('/public/legal/unknown')).status, 404);
    const head = await app.request('/public/legal/privacy', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const missing = await app.request('/public/legal/terms');
    assert.equal(missing.status, 503);
    assert.equal(missing.headers.get('location'), null);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
