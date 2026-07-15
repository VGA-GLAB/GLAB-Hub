import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createVolputasEntryPoints,
  normalizeHttpBaseUrl,
} from '../plugins/volputas/entry-points.ts';

describe('Volputas entry points', () => {
  it('builds the review routes below the configured web root', () => {
    const baseUrl = normalizeHttpBaseUrl('https://volputas.example/app', 'VOLPUTAS_WEB_URL');
    assert.ok(baseUrl);
    assert.deepEqual(createVolputasEntryPoints(baseUrl), {
      homeUrl: 'https://volputas.example/app/',
      videoReviewUrl: 'https://volputas.example/app/video-reviews/new',
      gameReviewUrl: 'https://volputas.example/app/game-reviews/new',
    });
  });

  it('treats an empty value as an intentionally unconfigured connector', () => {
    assert.equal(normalizeHttpBaseUrl('  ', 'VOLPUTAS_URL'), null);
    assert.equal(normalizeHttpBaseUrl(undefined, 'VOLPUTAS_URL'), null);
  });

  it('rejects unsafe or ambiguous service URLs', () => {
    assert.throws(
      () => normalizeHttpBaseUrl('javascript:alert(1)', 'VOLPUTAS_WEB_URL'),
      /HTTP or HTTPS/,
    );
    assert.throws(
      () => normalizeHttpBaseUrl('https://user:pass@example.test/', 'VOLPUTAS_WEB_URL'),
      /credentials, query, or fragment/,
    );
    assert.throws(
      () => normalizeHttpBaseUrl('https://example.test/?next=elsewhere', 'VOLPUTAS_WEB_URL'),
      /credentials, query, or fragment/,
    );
  });
});
