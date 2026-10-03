// Publish one built shell. Content-addressed URLs bypass prior browser/CDN assets.
// @implements SPEC-GLAB-SHELL-010
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/build');
await mkdir(resolve(output, 'vendor'), { recursive: true });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 20);
const assets = ['app.js', 'style.css', ...(await readdir(resolve(root, 'public/vendor')))
  .sort().map((name) => `vendor/${name}`)];
const urls = new Map();
const release = createHash('sha256');
for (const asset of assets) {
  const bytes = await readFile(resolve(root, 'public', asset));
  const name = asset.split('/').at(-1);
  const dot = name.lastIndexOf('.');
  const versioned = `vendor/${name.slice(0, dot)}.${digest(bytes)}${name.slice(dot)}`;
  await writeFile(resolve(output, versioned), bytes);
  urls.set(`/${asset}`, `/${versioned}`);
  release.update(asset).update(bytes);
}
// A panel-only change must also invalidate dynamic module imports.
for (const module of (await readdir(resolve(root, 'plugins'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const files = await readdir(resolve(root, 'plugins', module.name));
  if (files.includes('panel.js')) {
    release.update(module.name).update(await readFile(resolve(root, 'plugins', module.name, 'panel.js')));
  }
}
const template = await readFile(resolve(root, 'public/index.html'), 'utf8');
release.update(template);
const version = release.digest('hex').slice(0, 20);
const html = template.replace(/(href|src)="(\/[^"]+)"/g, (original, attribute, url) =>
  urls.has(url) ? `${attribute}="${urls.get(url)}"` : original)
  .replace('</head>', `  <meta name="glab-build" content="${version}" />\n  </head>`);
// Publish the entry document last; retain older hashed files for in-flight pages.
await writeFile(resolve(output, 'index.html.next'), html);
await rename(resolve(output, 'index.html.next'), resolve(output, 'index.html'));
