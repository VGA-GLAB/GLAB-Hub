// Corpus の配信 allowlist (`/vendor/:file`) に必要な frontend asset を同期する。
// dockview-core は Corpus 側の依存なので corpus/node_modules から取得し、
// GLAB 固有 icon は committed source を public/vendor/ へ build 時にコピーする。

import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const vendorDir = resolve(root, 'public/vendor');

const assets = [
  [
    resolve(root, 'corpus/node_modules/dockview-core/dist/styles/dockview.css'),
    resolve(vendorDir, 'dockview.css'),
  ],
  [
    resolve(root, 'public/apple-touch-icon.png'),
    resolve(vendorDir, 'apple-touch-icon.png'),
  ],
  [resolve(root, 'public/favicon.ico'), resolve(vendorDir, 'favicon.ico')],
];

mkdirSync(vendorDir, { recursive: true });
for (const [source, destination] of assets) {
  copyFileSync(source, destination);
}
