// slash command だけを登録する単発スクリプト (Bot を起動せずに反映したいとき)。
//
//   npm run register

import { loadConfig } from './config.ts';
import { registerCommands } from './commands/registry.ts';

const cfg = loadConfig();
await registerCommands(cfg);
console.log('[glab-bot] command 登録完了');
