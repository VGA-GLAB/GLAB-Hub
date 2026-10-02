import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// @ts-expect-error -- plain ESM setup script without type declarations
import { parseSubmoduleStatus } from '../scripts/site/corpus.mjs';

describe('parseSubmoduleStatus', () => {
  it('distinguishes recorded, uninitialized and mismatched submodules', () => {
    const stdout = [
      ' 7f30b814e9f51e6715ab982607bcb2a946a33c30 lib/cernere (v2.1.0-17-g7f30b81)',
      '-0df50edcd196a28da9aff854cf04cf4f867113d8 lib/vestigium',
      '+1111111111111111111111111111111111111111 lib/other (heads/main)',
      '',
    ].join('\n');
    assert.deepEqual(parseSubmoduleStatus(stdout), [
      { state: ' ', path: 'lib/cernere' },
      { state: '-', path: 'lib/vestigium' },
      { state: '+', path: 'lib/other' },
    ]);
  });

  it('returns no entries for a repository without submodules', () => {
    assert.deepEqual(parseSubmoduleStatus(''), []);
  });
});
