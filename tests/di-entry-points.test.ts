import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDiEntryPoints,
  normalizeDiBaseUrl,
  resolveDiLaunchUrl,
} from '../plugins/di/entry-points.ts';

describe('Di entry points', () => {
  it('exposes only discussion and learning entry points', () => {
    const baseUrl = normalizeDiBaseUrl('https://di.example/app', 'DISCUTERE_WEB_URL');
    assert.ok(baseUrl);
    assert.deepEqual(createDiEntryPoints(baseUrl), {
      discussionLaunchPath: '/discussion-launch',
      learningUrl: 'https://di.example/app/learning',
    });
  });

  it('accepts only same-origin Di launch paths', () => {
    assert.equal(
      resolveDiLaunchUrl('https://di.example/', '/flow?glab_launch=one-time'),
      'https://di.example/flow?glab_launch=one-time',
    );
    assert.equal(resolveDiLaunchUrl('https://di.example/', 'https://evil.example/flow?glab_launch=x'), null);
    assert.equal(resolveDiLaunchUrl('https://di.example/', '/admin'), null);
  });
});
