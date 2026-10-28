import assert from 'node:assert/strict';
import { it } from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyRelease, decode64 } from '../plugins/software-library/signed-release.ts';
import { readRelease } from '../plugins/software-library/release-file.ts';

const raw = readFileSync('tests/fixtures/library-release.cocoiru');
const pin = readFileSync('tests/fixtures/library-pin.txt', 'utf8');
const now = Date.parse('2026-10-28T00:00:00Z');
it('requires a pinned valid signer and detects all changed container components', () => {
  assert.equal(verifyRelease(raw, pin, now).manifest.id, 'fixture');
  assert.throws(() => verifyRelease(raw, '0'.repeat(64), now));
  assert.throws(() => verifyRelease(raw, pin, Date.parse('2041-01-01')));
  assert.throws(() => verifyRelease(raw, pin, Date.parse('2019-01-01')));
  for (const field of ['payload', 'manifest', 'signature', 'certificate']) {
    const value = JSON.parse(raw.toString());
    const bytes = Buffer.from(value[field], 'base64'); bytes[0] ^= 1; value[field] = bytes.toString('base64');
    assert.throws(() => verifyRelease(Buffer.from(JSON.stringify(value)), pin, now));
  }
  assert.throws(() => decode64('not base64!', 100));
  assert.throws(() => decode64('YQ==', 0));
  assert.equal(decode64(Buffer.alloc(16 * 1024 * 1024).toString('base64'), 16 * 1024 * 1024).length, 16 * 1024 * 1024);
});
it('delivers only the immutable release described by the catalog', async () => {
  const root = await mkdtemp(join(tmpdir(), 'glab-library-test-'));
  try {
    await writeFile(join(root, 'fixture.cocoiru'), raw, { flag: 'wx' });
    const manifest = verifyRelease(raw, pin, now).manifest;
    const entry = { id: 'fixture', name: 'Fixture', description: '', kind: 'sdk' as const, platform: 'any' as const,
      version: '1.0', license: 'TEST ONLY', sha256: manifest.sha256, downloadUrl: '', published: true };
    assert.deepEqual(await readRelease(root, pin, entry), raw);
    await assert.rejects(readRelease(root, pin, { ...entry, version: '2.0' }));
    await assert.rejects(readRelease(root, pin, { ...entry, sha256: '0'.repeat(64) }));
    await assert.rejects(readRelease(root, pin, { ...entry, id: '../fixture' }));
  } finally { await rm(root, { recursive: true, force: true }); }
});
