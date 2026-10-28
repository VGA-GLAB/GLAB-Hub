import assert from 'node:assert/strict';
import { it } from 'node:test';
import { librarySummary } from '../plugins/software-library/types.ts';

it('only exposes catalog metadata, including when storage gains private fields', () => {
  const entry = { id: 'plugin', name: 'Plugin', description: 'Description',
    kind: 'plugin' as const, platform: 'windows' as const, version: '1', license: 'MIT',
    published: true, downloadUrl: 'https://example.org/private', sha256: 'a'.repeat(64),
    grant: 'private-grant', encryptedKey: 'private-key', certificate: 'private-cert' };
  const summary = librarySummary(entry);
  assert.deepEqual(summary, { id: 'plugin', name: 'Plugin', description: 'Description',
    kind: 'plugin', platform: 'windows', version: '1', license: 'MIT', published: true });
  assert.equal(JSON.stringify(summary).includes('private'), false);
  assert.equal(entry.grant, 'private-grant');
});
