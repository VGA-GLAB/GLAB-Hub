import type { SqlDb } from '../data.ts';

/** 後方互換の schema 追加のみ。旧行の owner は証跡確認まで変更しない。 */
export function ensureJobOwnerSchema(db: SqlDb): void {
  db.exec('SAVEPOINT glab_job_owner_schema');
  try {
    const columns = db.prepare('PRAGMA table_info(glab_job)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'owner_user_id')) {
      db.exec('ALTER TABLE glab_job ADD COLUMN owner_user_id TEXT');
    }
    if (!columns.some((column) => column.name === 'owner_revision')) {
      db.exec('ALTER TABLE glab_job ADD COLUMN owner_revision INTEGER NOT NULL DEFAULT 0');
    }
    db.exec(`CREATE TABLE IF NOT EXISTS glab_job_owner_migration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id TEXT NOT NULL UNIQUE,
      job_id INTEGER NOT NULL REFERENCES glab_job(id),
      before_owner TEXT, after_owner TEXT,
      before_revision INTEGER NOT NULL, after_revision INTEGER NOT NULL,
      evidence_kind TEXT NOT NULL, evidence_ref TEXT NOT NULL,
      actor TEXT NOT NULL, created_at INTEGER NOT NULL,
      rollback_of INTEGER UNIQUE REFERENCES glab_job_owner_migration(id)
    );
    CREATE TRIGGER IF NOT EXISTS glab_job_owner_audit_no_update
      BEFORE UPDATE ON glab_job_owner_migration BEGIN SELECT RAISE(ABORT, 'append_only_audit'); END;
    CREATE TRIGGER IF NOT EXISTS glab_job_owner_audit_no_delete
      BEFORE DELETE ON glab_job_owner_migration BEGIN SELECT RAISE(ABORT, 'append_only_audit'); END;`);
    db.exec('RELEASE glab_job_owner_schema');
  } catch (error) {
    db.exec('ROLLBACK TO glab_job_owner_schema');
    db.exec('RELEASE glab_job_owner_schema');
    throw error;
  }
}
