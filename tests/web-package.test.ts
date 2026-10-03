import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('packaging changes asset URLs on content updates and retains the prior published shell on failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'glab-web-package-'));
  try {
    for (const path of ['scripts', 'public/vendor', 'plugins/demo']) {
      await mkdir(join(root, path), { recursive: true });
    }
    await cp('scripts/package-web.mjs', join(root, 'scripts/package-web.mjs'));
    await writeFile(join(root, 'public/index.html'), '<head><link href="/style.css"></head><script src="/app.js"></script>');
    await writeFile(join(root, 'public/app.js'), 'export const app = 1;');
    await writeFile(join(root, 'public/style.css'), 'body { color: red; }');
    await writeFile(join(root, 'plugins/demo/panel.js'), 'export const panel = 1;');
    const build = () => spawnSync(process.execPath, [join(root, 'scripts/package-web.mjs')], { encoding: 'utf8' });
    assert.equal(build().status, 0);
    const index = () => readFile(join(root, 'public/build/index.html'), 'utf8');
    const first = await index();
    const paths = [...first.matchAll(/(?:href|src)="\/(vendor\/[^"]+)"/g)].map((match) => match[1]);
    assert.equal(paths.length, 2);
    for (const path of paths) assert.ok((await readFile(join(root, 'public/build', path))).length);
    assert.equal(build().status, 0);
    assert.equal(await index(), first, 'unchanged contents yield stable URLs');
    await writeFile(join(root, 'public/style.css'), 'body { color: blue; }');
    assert.equal(build().status, 0);
    const second = await index();
    assert.notEqual(second, first);
    for (const path of paths) assert.ok((await readFile(join(root, 'public/build', path))).length, 'old assets remain available');
    await writeFile(join(root, 'plugins/demo/panel.js'), 'export const panel = 2;');
    assert.equal(build().status, 0);
    const third = await index();
    assert.notEqual(third, second, 'panel-only changes update the document version');
    await rm(join(root, 'public/app.js'));
    assert.notEqual(build().status, 0);
    assert.equal(await index(), third, 'failed packaging leaves the prior entry document intact');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
