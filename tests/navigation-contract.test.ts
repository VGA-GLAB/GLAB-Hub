import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const text = (path: string): Promise<string> => readFile(path, 'utf8');

describe('GLAB navigation contract', () => {
  it('uses the built-in overview as the only Status panel', async () => {
    const [packText, corpusApp] = await Promise.all([
      text('plugins/pack.json'),
      text('corpus/public/src/app.ts'),
    ]);
    const pack = JSON.parse(packText) as { modules?: string[] };
    assert.equal(pack.modules?.includes('status'), false);
    assert.match(corpusApp, /label:\s*'🟢 ステータス'/);
    assert.doesNotMatch(corpusApp, /label:\s*'[^']*概況'/);
  });

  it('registers one Volputas Review panel and excludes the legacy survey module', async () => {
    const [packText, volputasModule] = await Promise.all([
      text('plugins/pack.json'),
      text('plugins/volputas/index.ts'),
    ]);
    const pack = JSON.parse(packText) as { modules?: string[] };
    assert.equal(pack.modules?.includes('surveys'), false);
    assert.equal(pack.modules?.filter((module) => module === 'volputas').length, 1);
    assert.equal((volputasModule.match(/registerPanel\s*\(/g) ?? []).length, 1);
    assert.match(volputasModule, /title:\s*'レビュー'/);
  });

  it('renders attendance only while enabled and labels the action 出席', async () => {
    const panel = await text('plugins/attendance/panel.ts');
    assert.match(panel, /if \(!availability\.enabled \|\| !availability\.ostiarius\.baseUrl \|\| !localOstiariusReachable\)/);
    assert.match(panel, /el\('button', 'gl-btn', '出席'\)/);
    assert.doesNotMatch(panel, /出席する/);
    assert.doesNotMatch(panel, /button\.disabled\s*=\s*!availability\.enabled/);
  });

  it('keeps events in GLAB and creates the corresponding Aedilis reservation', async () => {
    const [eventModule, eventPanel, facilityStore, dataLayer] = await Promise.all([
      text('plugins/events/index.ts'),
      text('plugins/events/panel.ts'),
      text('plugins/events/facility-store.ts'),
      text('plugins/data.ts'),
    ]);
    assert.match(eventModule, /createReservation/);
    assert.match(eventModule, /routes\.post\('\/events'/);
    assert.match(eventPanel, /ctx\.api\('\/events'/);
    assert.match(eventPanel, /Aedilis候補/);
    assert.match(facilityStore, /CREATE TABLE IF NOT EXISTS glab_facility/);
    assert.doesNotMatch(dataLayer, /CREATE TABLE IF NOT EXISTS glab_survey/);
  });
});
