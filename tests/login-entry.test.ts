import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveLoginEntry } from '../public/src/login-config.ts';

test('ログインの入口は Cernere のログイン画面だけ (パスキーで続ける)', () => {
  assert.deepEqual(
    resolveLoginEntry({ cernereFrontendUrl: 'https://cr.ai-run-do.com', cernereClientId: 'registered-client' }),
    { kind: 'passkey', cernereFrontendUrl: 'https://cr.ai-run-do.com', cernereClientId: 'registered-client' },
  );
});

test('service 登録がない場合はログインを開始しない', () => {
  assert.equal(
    resolveLoginEntry({ cernereFrontendUrl: 'https://cr.ai-run-do.com' }).kind,
    'unavailable',
  );
});
test('rejects non-HTTP and credential-bearing login destinations', () => {
  for (const url of ['javascript:alert(1)', 'https://user:password@cr.example', 'https://cr.example/login', 'https://cr.example/?project=foreign']) {
    assert.equal(resolveLoginEntry({ cernereFrontendUrl: url, cernereClientId: 'registered-client' }).kind, 'unavailable');
  }
});

test('Cernere ログイン画面の接続先が無い・URL でないときは入口を出さず理由を返す', () => {
  assert.equal(resolveLoginEntry({}).kind, 'unavailable');
  assert.equal(resolveLoginEntry({ cernereFrontendUrl: '  ' }).kind, 'unavailable');
  assert.equal(resolveLoginEntry({ cernereFrontendUrl: 'not a url' }).kind, 'unavailable');
});
