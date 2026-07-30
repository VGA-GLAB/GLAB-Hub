// GitHub public API クライアントの契約テスト
// (spec/tasks/2026-07-30-01-github-game-list.md、spec/data/glab-project-release.md)。
// 実際の api.github.com は叩かず、 応答形の揺れ (無題 Release / draft / README・contributors 欠損)
// で同期全体が落ちないことを確認する。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { GitHubClient, parseRepoUrl, parseReleaseList } from '../plugins/projects/github-client.ts';

test('parseRepoUrl accepts github.com repo urls only', () => {
  assert.deepEqual(parseRepoUrl('https://github.com/VGA-GLAB/Foo'), { owner: 'VGA-GLAB', repo: 'Foo' });
  assert.deepEqual(parseRepoUrl('https://github.com/VGA-GLAB/Foo.git'), { owner: 'VGA-GLAB', repo: 'Foo' });
  assert.equal(parseRepoUrl('https://gitlab.com/a/b'), null);
  assert.equal(parseRepoUrl('https://github.com/only-owner'), null);
  assert.equal(parseRepoUrl('https://user:pw@github.com/a/b'), null);
});

const release = {
  id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', published_at: '2026-07-30T00:00:00Z',
  assets: [{ id: 10, name: 'Game.zip', size: 1234,
    browser_download_url: 'https://github.com/VGA-GLAB/Foo/releases/download/v1.0.0/Game.zip' }],
};

test('parseReleaseList accepts a fully-populated payload', () => {
  const out = parseReleaseList([release]);
  assert.ok(out);
  assert.equal(out[0]?.tag, 'v1.0.0');
  assert.equal(out[0]?.assets[0]?.name, 'Game.zip');
});

test('parseReleaseList rejects entries with missing fields', () => {
  const broken = [{ ...release }];
  delete (broken[0] as Record<string, unknown>).tag_name;
  assert.equal(parseReleaseList(broken), null);
});

test('parseReleaseList falls back to the tag for untitled releases', () => {
  const out = parseReleaseList([{ ...release, name: null }]);
  assert.ok(out);
  assert.equal(out[0]?.name, 'v1.0.0');
});

test('parseReleaseList skips drafts instead of discarding the whole list', () => {
  const draft = { ...release, id: 2, tag_name: 'v2.0.0', published_at: null, draft: true };
  const out = parseReleaseList([draft, release]);
  assert.ok(out);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.tag, 'v1.0.0');
});

test('parseReleaseList rejects assets with a non-https download url', () => {
  const asset = { ...release.assets[0], browser_download_url: 'javascript:alert(1)' };
  assert.equal(parseReleaseList([{ ...release, assets: [asset] }]), null);
});

test('getProject tolerates a repository without README or contributors', async () => {
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    if (url.endsWith('/readme')) return new Response('Not Found', { status: 404 });
    if (url.includes('/contributors')) return new Response(null, { status: 204 });
    if (url.includes('/releases')) return Response.json([release]);
    return Response.json({ description: 'desc', topics: ['game'] });
  }) as typeof fetch;

  const data = await new GitHubClient(undefined, fetchImpl, () => 0)
    .getProject('https://github.com/VGA-GLAB/Foo');

  assert.ok(data);
  assert.equal(data.description, 'desc');
  assert.equal(data.readme, null);
  assert.deepEqual(data.contributors, []);
  assert.equal(data.releases.length, 1);
});

test('getProject tolerates repository metadata without topics', async () => {
  const fetchImpl = (async (input: unknown) => {
    const url = String(input);
    if (url.includes('/releases')) return Response.json([]);
    if (url.endsWith('/readme') || url.includes('/contributors')) return new Response(null, { status: 204 });
    return Response.json({ description: null });
  }) as typeof fetch;

  const data = await new GitHubClient(undefined, fetchImpl, () => 0)
    .getProject('https://github.com/VGA-GLAB/Foo');

  assert.ok(data);
  assert.equal(data.description, null);
  assert.deepEqual(data.topics, []);
});

test('github client pins the API host', () => {
  const source = readFileSync(new URL('../plugins/projects/github-client.ts', import.meta.url), 'utf8');
  assert.ok(source.includes('https://api.github.com'), 'API host constant missing');
});
