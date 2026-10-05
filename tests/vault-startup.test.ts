import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { requireInjectedEnvironment } from '../startup/environment.ts';
import contract from '../contracts/injected-environment.contract.ts';

const complete = {
  CERNERE_BASE_URL: 'https://auth.example.test',
  CERNERE_PROJECT_CLIENT_ID: 'test-client',
  CERNERE_PROJECT_CLIENT_SECRET: 'test-secret-not-for-logs',
  CORPUS_PUBLIC_URL: 'https://hub.example.test',
  CORPUS_TOKEN_MODE: 'cernere-project-token',
  GLAB_DATABASE_URL: 'postgresql://test:test@localhost/test',
};

test('Ex injection is sufficient and is not mutated', () => {
  const env = Object.freeze({ ...complete });
  assert.equal(requireInjectedEnvironment(env), undefined);
  assert.equal(contract.post(undefined, env), true);
});

test('each missing or blank required value fails without exposing other values', () => {
  for (const name of Object.keys(complete)) {
    for (const value of [undefined, '', ' \t ']) {
      const env = { ...complete, [name]: value };
      assert.throws(() => requireInjectedEnvironment(env), (error: unknown) => {
        assert.equal(contract.postThrow(error, env), true);
        assert.equal((error as Error).message, `Missing Excubitor-injected environment: ${name}`);
        return true;
      });
    }
  }
});

test('all missing keys are reported even when legacy credentials are present', () => {
  assert.throws(() => requireInjectedEnvironment({ INFISICAL_CLIENT_SECRET: 'legacy-secret' }), {
    message: `Missing Excubitor-injected environment: ${Object.keys(complete).join(', ')}`,
  });
});

test('launch configuration uses injected env and bypasses standalone secret bootstrap', () => {
  const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts.dev, 'tsx watch server.ts');
  assert.equal(pkg.scripts.start, 'tsx server.ts');
  assert.equal(Object.keys(pkg.scripts).some((key) => key.startsWith('env:')), false);
  assert.doesNotMatch(JSON.stringify(pkg.scripts), /env-file|dotenv|env-cli/);
  const launcher = read('server.ts');
  assert.match(launcher, /import\('\.\/corpus\/server\/index\.ts'\)/);
  assert.doesNotMatch(launcher, /import\('\.\/corpus\/server\/bootstrap\.ts'\)/);
  // Corpus は import だけでは listen しない (Corpus spec/feature/host-cleanup.md)。起動口を呼んで cleanup を保持する。
  assert.match(launcher, /const \{ startCorpus \} = await import\('\.\/corpus\/server\/index\.ts'\)/);
  assert.match(launcher, /await startCorpus\(\)/);
  assert.match(launcher, /await closeCorpus\(\);\s*await close\(\);/);
  assert.ok(launcher.indexOf('requireInjectedEnvironment(process.env)') < launcher.indexOf('await initializeEventStore'));
  assert.match(launcher, /installLogging\(\)/);
  const catalog = read('excubitor.catalog.yaml');
  assert.match(catalog, /^\s+command: node --run start\s*$/m);
  assert.match(catalog, /^\s+build_command: npm run build\s*$/m);
  assert.match(catalog, /^\s+allow_hot_reload: false\s*$/m);
  for (const file of ['env-cli.config.ts', '.env.example']) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false);
  }
});
