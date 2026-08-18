// 実 SQLite (node:sqlite) の一時 DB を開くテスト用フィクスチャ。
//
// tests/schema-wal-idempotence.test.ts と同じ流儀で、 fake DB ではなく本物の
// SQL に対して store 層の CRUD を確かめるために使う。 ファイル名が *.test.ts では
// ないので `npm test` のグロブには拾われない。

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureSchema, type SqlDb } from '../plugins/data.ts';

export interface TempDb {
  db: SqlDb;
  close(): void;
}

/** WAL + ensureSchema 済みの空 DB を開く。 close() でファイルごと片付ける。 */
export function openTempDb(prefix: string): TempDb {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(join(dir, 'corpus.db'));
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  try {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 2000');
    ensureSchema(db);
  } catch (error) {
    try {
      db.close();
    } catch {
      // 初期化が既に失敗しているため、close は best-effort。
    }
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
  return {
    db,
    close(): void {
      try {
        db.close();
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  };
}
