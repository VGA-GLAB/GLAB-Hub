import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { Hono, type CorpusContext } from '../corpus/server/hub/sdk.ts';
import softwareLibrary from '../plugins/software-library/index.ts';
import { distributionUrl } from '../plugins/software-library/distribution-url.ts';

it('isolates drafts and management from ordinary users and requires complete publication', async () => {
  const db = new DatabaseSync(':memory:');
  const app = new Hono();
  let signedIn = false, admin = false;
  app.use('*', async (c, next) => {
    if (signedIn) {
      c.set('userToken', 'test-only-user');
      c.set('auth', { userId: 'user', externalId: 'user', role: 'general', displayName: null, isAdmin: admin, projectKey: 'glab' });
    }
    await next();
  });
  try {
    await softwareLibrary.setup({ db, env: () => undefined, logger: { warn: () => {} }, registerRoute: (routes: Hono) => app.route('/', routes), registerPanel: () => {} } as unknown as CorpusContext);
    const input = { name: 'Runtime', description: 'Cocoiru runtime', kind: 'runtime', platform: 'windows', version: '', license: '', downloadUrl: '', sha256: '', published: false };
    const save = (data: unknown) => app.request('/entries/runtime', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    assert.equal((await app.request('/entries')).status, 401);
    assert.equal((await app.request('/download/runtime', { method: 'POST' })).status, 401);
    signedIn = true;
    assert.equal((await app.request('/download/runtime', { method: 'POST' })).status, 503);
    assert.equal((await app.request('/manage')).status, 403);
    assert.equal((await save(input)).status, 403);
    admin = true;
    assert.equal((await save(input)).status, 200);
    assert.deepEqual((await (await app.request('/entries')).json()).entries, []);
    assert.equal((await save({ ...input, published: true })).status, 400);
    const release = { ...input, published: true, version: '1.0', license: 'MIT', sha256: 'a'.repeat(64), downloadUrl: '' };
    assert.equal((await save({ ...release, downloadUrl: 'https://example.org/runtime.zip?token=private' })).status, 400);
    assert.equal((await save({ ...release, unknown: 'not accepted' })).status, 400);
    assert.equal((await save(release)).status, 200);
    admin = false;
    const listed = await app.request('/entries');
    assert.equal(listed.headers.get('cache-control'), 'private, no-store');
    const entries = (await listed.json()).entries;
    assert.equal(entries.length, 1);
    assert.deepEqual(Object.keys(entries[0]).sort(), ['id', 'name', 'description', 'kind', 'platform', 'version', 'license', 'published'].sort());
    assert.equal(JSON.stringify(entries).includes('https://example.org'), false);
    admin = true;
    // Admins browsing the catalog receive the same read-only projection.
    assert.deepEqual((await (await app.request('/entries')).json()).entries, entries);
    admin = true;
    assert.equal((await save({ ...release, published: false })).status, 200);
    assert.deepEqual((await (await app.request('/entries')).json()).entries, []);
    assert.equal((await save({ ...input, description: 'x'.repeat(17000) })).status, 413);
    assert.equal((await app.request('/entries/runtime', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: new Uint8Array([255]) })).status, 400);
  } finally { db.close(); }
});

it('never turns credentials or executable URL schemes into acquisition links', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///C:/test', 'http://example.org/file',
    'https://user:password@example.org/file', 'https://example.org/file?signature=secret', 'https://example.org/file#secret',
    'https://example.org\\@elsewhere.test/file', 'https://example.org/\nfile']) assert.equal(distributionUrl(url), null);
  assert.equal(distributionUrl('https://example.org/release/v1/library.zip'), 'https://example.org/release/v1/library.zip');
});
