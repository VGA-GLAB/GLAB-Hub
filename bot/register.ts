// slash command を同期する単発スクリプト (Bot を起動せずに反映したいとき)。
// 現在の正本は空配列なので、 対象 scope の既存 command を削除する。
//
//   npm run register

import { loadConfig } from './config.ts';
import { registerCommands } from './commands/registry.ts';

const cfg = loadConfig();
try {
  await registerCommands(cfg);
} catch (e) {
  // 削除の失敗を成功と誤認すると旧 command が残ったまま移行完了と判断される。
  console.error('[glab-bot] command 同期に失敗:', e);
  process.exit(1);
}
console.log('[glab-bot] command 同期完了');
