import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { Hono } from '../corpus/server/hub/sdk.ts';
import { installPublicReadRoutes } from '../corpus/server/public-read-routes.ts';
import { createClientInstallRoutes } from '../plugins/client/install-routes.ts';

test('GLab-Client installs from the Hub and launches its existing authenticated shell', async () => {
  const app = new Hono();
  installPublicReadRoutes(app, createClientInstallRoutes(fileURLToPath(new URL('../public/client/', import.meta.url))));
  const shell = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const manifestPath = shell.match(/<link rel="manifest" href="([^"]+)"/)?.[1];
  assert.ok(manifestPath);
  const response = await app.request(manifestPath);
  assert.equal(response.headers.get('content-type'), 'application/manifest+json');
  const manifest = await response.json();
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.name, 'GLab-Client');
  assert.equal(new URL(manifest.start_url, 'https://glab.test').pathname, '/');
  assert.equal(manifest.scope, '/');
  assert.deepEqual(manifest.icons.map((icon: { sizes: string }) => icon.sizes), ['192x192', '512x512']);
  for (const icon of manifest.icons) {
    const iconPath = new URL(icon.src, new URL(manifestPath, 'https://glab.test')).pathname;
    const image = await app.request(iconPath);
    assert.equal(image.headers.get('content-type'), 'image/png');
    const png = Buffer.from(await image.arrayBuffer());
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  assert.equal((await app.request(manifestPath, { method: 'POST' })).status, 405);
});
