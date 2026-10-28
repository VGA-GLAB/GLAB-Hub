import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono, type CorpusContext } from '../corpus/server/hub/sdk.ts';
import softwareLibrary from '../plugins/software-library/index.ts';
import { saveLibrary } from '../plugins/software-library/store.ts';
import { verifyRelease } from '../plugins/software-library/signed-release.ts';

it('delivers a verified release only to authenticated members and rechecks publication', async () => {
  const db = new DatabaseSync(':memory:'), root = await mkdtemp(join(tmpdir(), 'glab-delivery-test-'));
  const raw = readFileSync('tests/fixtures/library-release.cocoiru'), pin = readFileSync('tests/fixtures/library-pin.txt', 'utf8');
  const manifest = verifyRelease(raw, pin).manifest;
  const app = new Hono(); let signedIn = false;
  app.use('*', async (c, next) => { if (signedIn) c.set('userToken', 'offline-member'); await next(); });
  try {
    await writeFile(join(root, 'fixture.cocoiru'), raw, { flag: 'wx' });
    await softwareLibrary.setup({ db, env: (key: string) => key === 'GLAB_LIBRARY_RELEASE_ROOT' ? root : key === 'GLAB_LIBRARY_CERT_SHA256' ? pin : undefined,
      logger: { warn: () => {} }, registerRoute: (route: Hono) => app.route('/', route), registerPanel: () => {} } as unknown as CorpusContext);
    const entry = { id: 'fixture', name: 'Fixture', description: '', kind: 'sdk' as const, platform: 'any' as const,
      version: '1.0', license: 'TEST ONLY', sha256: manifest.sha256, downloadUrl: '', published: true };
    saveLibrary(db, entry, new Date().toISOString());
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
    const nonce = 'c'.repeat(64), request = { publicKey: publicKey.export({ type: 'spki', format: 'pem' }), nonce };
    const download = (body: unknown = request) => app.request('/download/fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await download()).status, 401);
    signedIn = true;
    assert.equal((await download({ ...request, extra: 'rejected' })).status, 400);
    const result = await download(); assert.equal(result.status, 200);
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    const value = await result.json();
    const aad = Buffer.from(`glab-delivery-v1:${nonce}`);
    const key = privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256', oaepLabel: aad }, Buffer.from(value.wrappedKey, 'base64'));
    try {
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
      cipher.setAAD(aad); cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      const decoded = Buffer.concat([cipher.update(Buffer.from(value.ciphertext, 'base64')), cipher.final()]);
      assert.deepEqual(decoded, raw); assert.equal(verifyRelease(decoded, pin).manifest.id, 'fixture');
    } finally { key.fill(0); }
    saveLibrary(db, { ...entry, published: false }, new Date().toISOString());
    assert.equal((await download()).status, 404);
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});
