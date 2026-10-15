import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveLoginEntry } from '../public/src/login-config.ts';

test('ログインの入口は Cernere のログイン画面だけ (パスキーで続ける)', () => {
  assert.deepEqual(
    resolveLoginEntry({ cernereFrontendUrl: 'https://cr.ai-run-do.com', authUiMode: 'passkey' }),
    { kind: 'passkey', cernereFrontendUrl: 'https://cr.ai-run-do.com' },
  );
});

test('旧 composite 設定でも email/password の画面には戻さない', () => {
  assert.equal(
    resolveLoginEntry({ cernereFrontendUrl: 'https://cr.ai-run-do.com', authUiMode: 'composite' }).kind,
    'passkey',
  );
});

test('Cernere ログイン画面の接続先が無い・URL でないときは入口を出さず理由を返す', () => {
  assert.equal(resolveLoginEntry({}).kind, 'unavailable');
  assert.equal(resolveLoginEntry({ cernereFrontendUrl: '  ' }).kind, 'unavailable');
  assert.equal(resolveLoginEntry({ cernereFrontendUrl: 'not a url' }).kind, 'unavailable');
});
