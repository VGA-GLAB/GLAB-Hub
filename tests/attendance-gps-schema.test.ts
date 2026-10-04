import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { ensureSchema } from '../plugins/data.ts';

describe('glab_attendance gps source migration', () => {
  it('widens a face-generation ledger to gps while keeping existing assurance values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'glab-gps-schema-'));
    const db = new DatabaseSync(join(dir, 'corpus.db'));
    try {
      db.exec(`CREATE TABLE glab_attendance (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
        facility_id TEXT NOT NULL, checked_in_at INTEGER NOT NULL,
        source TEXT NOT NULL CHECK (source IN
          ('passkey', 'manual', 'face', 'face_passive', 'staff_override', 'session', 'password')),
        assurance TEXT, event_id INTEGER, detail TEXT, UNIQUE(user_id, date, facility_id)
      )`);
      db.exec(`INSERT INTO glab_attendance (id, user_id, date, facility_id, checked_in_at, source, assurance)
        VALUES ('a-1', 'user-1', '2026-10-01', 'room-a', 1, 'face', 'high')`);

      ensureSchema(db);
      ensureSchema(db); // 2 度目 (= もう片方の接続) でも壊れない

      const kept = db.prepare('SELECT source, assurance FROM glab_attendance WHERE id = ?').get('a-1') as {
        source: string; assurance: string | null;
      };
      assert.deepEqual({ ...kept }, { source: 'face', assurance: 'high' });
      assert.doesNotThrow(() => db.prepare(`INSERT INTO glab_attendance
        (id, user_id, date, facility_id, checked_in_at, source, assurance) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run('a-2', 'user-2', '2026-10-01', 'room-a', 2, 'gps', 'low'));
      assert.ok(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'glab_gps_photo'`).get());
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
