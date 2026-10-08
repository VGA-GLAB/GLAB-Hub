import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { inspectOdeumEnvironment, requireInjectedEnvironment } from '../startup/environment.ts';

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('missing odeum env only disables odeum and reports key names', () => {
  assert.deepEqual(inspectOdeumEnvironment({}), {
    enabled: false,
    missing: ['ODEUM_RELAY_URL', 'GLAB_ODEUM_TICKET_PRIVATE_KEY', 'GLAB_ODEUM_TICKET_KID'],
  });
  assert.deepEqual(inspectOdeumEnvironment({
    ODEUM_RELAY_URL: 'http://127.0.0.1:4400',
    GLAB_ODEUM_TICKET_PRIVATE_KEY: 'pem',
    GLAB_ODEUM_TICKET_KID: ' ',
  }), { enabled: false, missing: ['GLAB_ODEUM_TICKET_KID'] });
});

test('odeum env is not part of the hub-stopping required set', () => {
  assert.equal(requireInjectedEnvironment({
    CERNERE_BASE_URL: 'https://auth.example.test',
    CERNERE_PROJECT_CLIENT_ID: 'c',
    CERNERE_PROJECT_CLIENT_SECRET: 's',
    CORPUS_PUBLIC_URL: 'https://hub.example.test',
    CORPUS_TOKEN_MODE: 'cernere-project-token',
    GLAB_DATABASE_URL: 'postgresql://t:t@localhost/t',
  }), undefined);
  assert.match(read('server.ts'), /inspectOdeumEnvironment\(process\.env\)/);
});

test('odeum is registered as a plugin with its panel built and relay health aggregated', () => {
  const pack = JSON.parse(read('plugins/pack.json')) as { modules: string[] };
  assert.ok(pack.modules.includes('odeum'));
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  assert.match(pkg.scripts['build:panels']!, /plugins\/odeum\/panel\.ts/);
  const index = read('plugins/odeum/index.ts');
  assert.match(index, /id: 'odeum-relay'/);
  assert.match(index, /healthPath: '\/health'/);
  const routes = read('plugins/odeum/routes.ts');
  assert.doesNotMatch(index + routes, /from 'hono'/);
  assert.doesNotMatch(routes, /logger\.\w+\([^)]*(ticket\.token|text|comment)/i,
    'チケットやコメント本文をログに出さない');
});

test('the dashboard puts the live card above the rest and the viewer separates reactions and text intent', () => {
  const dashboard = read('plugins/dashboard/panel.ts');
  assert.ok(dashboard.indexOf('renderLiveCards') < dashboard.indexOf('renderDailyEngagement(summary.daily'));
  const viewer = read('plugins/odeum/viewer-ui.ts');
  for (const area of ['od-good-area', 'od-stamps']) assert.match(viewer, new RegExp(area));
  assert.match(viewer, /reactions\.append\(goodArea, stampArea, composer\.element\)/);
  const composer = read('plugins/odeum/reaction-composer.ts');
  assert.match(composer, /fields\.append\(telopForm, postForm\)/, 'ツッコミと質問・感想は別の入力');
  assert.match(composer, /visibility\.checked = false/, '質問・感想は既定で非表示');
  assert.match(viewer, /sendSubmission\(text, category, show\)/, '投稿者の表示選択を送信する');
  assert.match(viewer, /event\.repeat/, '長押しのキーリピートは連打扱いにしない');
  const styles = read('plugins/odeum/styles.ts');
  assert.match(styles, /min-height: 96px/);
});
