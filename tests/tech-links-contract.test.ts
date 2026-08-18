import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeLinkUrl } from '../plugins/tech-links/url.ts';

const readSource = (relative: string): string =>
  readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('normalizeLinkUrl lowercases the host and drops tracking params', () => {
  assert.equal(normalizeLinkUrl('HTTPS://Example.COM/a/?utm_source=x&b=1'), 'https://example.com/a?b=1');
});

test('normalizeLinkUrl drops a trailing slash but keeps the path', () => {
  assert.equal(normalizeLinkUrl('https://example.com/docs/'), 'https://example.com/docs');
});

test('normalizeLinkUrl rejects non-http schemes', () => {
  assert.equal(normalizeLinkUrl('javascript:alert(1)'), null);
  assert.equal(normalizeLinkUrl('file:///etc/passwd'), null);
});

test('normalizeLinkUrl strips embedded credentials and the fragment', () => {
  assert.equal(normalizeLinkUrl('https://user:secret@example.com/a#frag'), 'https://example.com/a');
});

test('normalizeLinkUrl rejects values that are not URLs at all', () => {
  assert.equal(normalizeLinkUrl(''), null);
  assert.equal(normalizeLinkUrl('example.com/a'), null);
});

test('free-text search escapes LIKE wildcards instead of interpolating them', () => {
  const src = readSource('plugins/tech-links/store.ts');
  assert.ok(/ESCAPE/.test(src), 'LIKE filters must declare an escape character');
  assert.ok(/replace\(\/\[\\\\%_\]\/g/.test(src), 'the search term must have % _ \\ escaped');
  assert.ok(!/`%\$\{q\}%`/.test(src), 'the raw query must not be interpolated into a LIKE pattern');
});

test('edit and delete are restricted to the poster or an admin', () => {
  const src = readSource('plugins/tech-links/index.ts');
  assert.ok(/row\.posted_by === identity\.userId \|\| identity\.isAdmin/.test(src), 'canEdit must compare the poster');
  assert.equal(src.match(/if \(!canEdit\(/g)?.length, 2, 'both PATCH and DELETE must call canEdit');
  assert.ok(/'forbidden'/.test(src), 'a non-owner must get 403');
});

test('the external share route requires both a service token and a user identity', () => {
  const src = readSource('plugins/tech-links/index.ts');
  assert.ok(/requireServiceToken\(/.test(src), 'service token guard missing');
  assert.ok(/getIdentity\(/.test(src), 'the poster must come from the user identity');
  assert.ok(!/body\.postedBy|postedBy:\s*body\./.test(src), 'postedBy must never be taken from the request body');
});

test('unshare matches on source, source_ref and the caller', () => {
  const src = readSource('plugins/tech-links/store.ts');
  assert.ok(/source_ref/.test(src), 'source_ref matching missing');
  assert.ok(/posted_by/.test(src), 'the caller must be part of the delete condition');
});

test('deletion is logical, not physical', () => {
  const src = readSource('plugins/tech-links/store.ts');
  assert.ok(/deleted_at/.test(src), 'deleted_at must be used');
  assert.ok(!/DELETE FROM glab_tech_link\b/.test(src), 'links must not be hard deleted');
});

test('listing hides deleted links', () => {
  const src = readSource('plugins/tech-links/store.ts');
  assert.ok(/deleted_at IS NULL/.test(src), 'listing must filter out deleted rows');
});

test('the module is registered in the pack and the panel build', () => {
  const pack = JSON.parse(readSource('plugins/pack.json')) as { modules: string[] };
  assert.ok(pack.modules.includes('tech-links'), 'pack.json must list tech-links');
  assert.ok(readSource('package.json').includes('plugins/tech-links/panel.ts'), 'build:panels must include the tech-links panel');
});
