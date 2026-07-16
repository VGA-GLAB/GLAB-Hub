import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizeHttpBaseUrl,
} from '../plugins/volputas/entry-points.ts';

describe('Volputas API URL', () => {
  it('normalizes the configured API root', () => {
    assert.equal(
      normalizeHttpBaseUrl('https://volputas.example/app', 'VOLPUTAS_URL'),
      'https://volputas.example/app/',
    );
  });

  it('treats an empty value as an intentionally unconfigured connector', () => {
    assert.equal(normalizeHttpBaseUrl('  ', 'VOLPUTAS_URL'), null);
    assert.equal(normalizeHttpBaseUrl(undefined, 'VOLPUTAS_URL'), null);
  });

  it('rejects unsafe or ambiguous service URLs', () => {
    assert.throws(
      () => normalizeHttpBaseUrl('javascript:alert(1)', 'VOLPUTAS_URL'),
      /HTTP or HTTPS/,
    );
    assert.throws(
      () => normalizeHttpBaseUrl('https://user:pass@example.test/', 'VOLPUTAS_URL'),
      /credentials, query, or fragment/,
    );
    assert.throws(
      () => normalizeHttpBaseUrl('https://example.test/?next=elsewhere', 'VOLPUTAS_URL'),
      /credentials, query, or fragment/,
    );
  });
});
