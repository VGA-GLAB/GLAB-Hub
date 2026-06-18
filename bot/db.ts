// GLAB Bot の SQLite 接続。
//
// Corpus hub と *同じ* corpus.db を WAL で開く。 両プロセスが同じファイルに
// 並行アクセスするが、 SQLite WAL は複数プロセスの read/write を安全に捌く。
// スキーマは plugins/data.ts に集約 (hub と齟齬を出さない)。

import Database from 'better-sqlite3';
import { ensureSchema, type SqlDb } from '../plugins/data.ts';

export function openSharedDb(dbPath: string): SqlDb {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  // hub 未起動でテーブルが無くても bot 単独で動けるよう冪等初期化。
  ensureSchema(db as unknown as SqlDb);
  return db as unknown as SqlDb;
}
