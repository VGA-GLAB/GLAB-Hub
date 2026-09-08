import type { SqlDb } from '../data.ts';

export interface OwnerMigrationInput {
  operationId: string;
  jobId: number;
  expectedOwner: string | null;
  expectedRevision: number;
  ownerUserId: string;
  evidenceKind: 'exact_user_id' | 'admin_verified' | 'authenticated_link';
  evidenceRef: string;
}

interface AuditRow {
  id: number; operation_id: string; job_id: number;
  before_owner: string | null; after_owner: string | null;
  before_revision: number; after_revision: number;
  evidence_kind: string; evidence_ref: string; actor: string;
  rollback_of: number | null;
}

export interface OwnerMigrationResult { applied: boolean; auditId: number; revision: number }

export function migrateJobOwner(
  db: SqlDb, input: OwnerMigrationInput, actor: string, now = Date.now(),
): OwnerMigrationResult {
  validate(input, actor);
  return atomic(db, () => {
    const previous = db.prepare('SELECT * FROM glab_job_owner_migration WHERE operation_id = ?')
      .get(input.operationId) as AuditRow | undefined;
    if (previous) {
      if (previous.job_id !== input.jobId || previous.after_owner !== input.ownerUserId
        || previous.before_owner !== input.expectedOwner || previous.before_revision !== input.expectedRevision
        || previous.evidence_kind !== input.evidenceKind || previous.evidence_ref !== input.evidenceRef
        || previous.actor !== actor || previous.rollback_of !== null) throw new Error('operation_conflict');
      return { applied: false, auditId: previous.id, revision: previous.after_revision };
    }
    const job = db.prepare('SELECT posted_by FROM glab_job WHERE id = ?').get(input.jobId) as { posted_by: string } | undefined;
    if (!job) throw new Error('job_not_found');
    if (!db.prepare('SELECT 1 FROM glab_user WHERE user_id = ?').get(input.ownerUserId)) {
      throw new Error('unknown_owner');
    }
    if (input.evidenceKind === 'exact_user_id'
      && (/ \(discord\)$/i.test(job.posted_by) || job.posted_by !== input.ownerUserId)) {
      throw new Error('evidence_mismatch');
    }
    return changeOwner(db, input, actor, now, null);
  });
}

export function rollbackJobOwner(
  db: SqlDb, auditId: number, operationId: string, actor: string, now = Date.now(),
): OwnerMigrationResult {
  if (!Number.isSafeInteger(auditId) || auditId <= 0 || !operationId.trim() || !actor.trim()) {
    throw new Error('invalid_rollback');
  }
  return atomic(db, () => {
    const audit = db.prepare('SELECT * FROM glab_job_owner_migration WHERE id = ?').get(auditId) as AuditRow | undefined;
    if (!audit || audit.rollback_of !== null) throw new Error('migration_not_found');
    const previous = db.prepare('SELECT * FROM glab_job_owner_migration WHERE operation_id = ?').get(operationId) as AuditRow | undefined;
    if (previous) {
      if (previous.rollback_of !== auditId || previous.actor !== actor) throw new Error('operation_conflict');
      return { applied: false, auditId: previous.id, revision: previous.after_revision };
    }
    return changeOwner(db, {
      operationId, jobId: audit.job_id, expectedOwner: audit.after_owner,
      expectedRevision: audit.after_revision, ownerUserId: audit.before_owner,
      evidenceKind: 'rollback', evidenceRef: `audit:${auditId}`,
    }, actor, now, auditId);
  });
}

function changeOwner(
  db: SqlDb, input: Omit<OwnerMigrationInput, 'ownerUserId' | 'evidenceKind'> & {
    ownerUserId: string | null; evidenceKind: string;
  }, actor: string, now: number, rollbackOf: number | null,
): OwnerMigrationResult {
  const revision = input.expectedRevision + 1;
  if (!Number.isSafeInteger(revision)) throw new Error('owner_revision_exhausted');
  const changed = db.prepare(`UPDATE glab_job SET owner_user_id = ?, owner_revision = ?
    WHERE id = ? AND owner_user_id IS ? AND owner_revision = ?`)
    .run(input.ownerUserId, revision, input.jobId, input.expectedOwner, input.expectedRevision);
  if (Number(changed.changes) !== 1) throw new Error('owner_conflict');
  const audit = db.prepare(`INSERT INTO glab_job_owner_migration
    (operation_id, job_id, before_owner, after_owner, before_revision, after_revision,
     evidence_kind, evidence_ref, actor, created_at, rollback_of) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(input.operationId, input.jobId, input.expectedOwner, input.ownerUserId,
      input.expectedRevision, revision, input.evidenceKind, input.evidenceRef, actor, now, rollbackOf);
  return { applied: true, auditId: Number(audit.lastInsertRowid), revision };
}

function validate(input: OwnerMigrationInput, actor: string): void {
  if (!input.operationId?.trim() || !input.ownerUserId?.trim() || !input.evidenceRef?.trim() || !actor.trim()
    || !Number.isSafeInteger(input.jobId) || input.jobId <= 0
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || (input.expectedOwner !== null && (typeof input.expectedOwner !== 'string' || !input.expectedOwner.trim()))
    || !['exact_user_id', 'admin_verified', 'authenticated_link'].includes(input.evidenceKind)) {
    throw new Error('invalid_owner_migration');
  }
}

function atomic<T>(db: SqlDb, action: () => T): T {
  db.exec('SAVEPOINT glab_owner_change');
  try {
    const result = action();
    db.exec('RELEASE glab_owner_change');
    return result;
  } catch (error) {
    db.exec('ROLLBACK TO glab_owner_change');
    db.exec('RELEASE glab_owner_change');
    throw error;
  }
}
