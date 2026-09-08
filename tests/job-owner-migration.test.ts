import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createJob, ensureGlabUser, ensureSchema, getJob } from '../plugins/data.ts';
import { classifyJobOwners } from '../plugins/jobs/owner-classification.ts';
import { migrateJobOwner, rollbackJobOwner } from '../plugins/jobs/owner-migration.ts';

test('owner migration excludes Discord names, audits CAS and protects rollback against ABA', () => {
  const db = new DatabaseSync(':memory:');
  try {
    ensureSchema(db); ensureSchema(db);
    ensureGlabUser(db, 'u1'); ensureGlabUser(db, 'name (discord)');
    const jobId = createJob(db, { company: 'Example', postedBy: 'name (discord)' });
    const classified = classifyJobOwners(db).find((job) => job.jobId === jobId);
    assert.equal(classified?.bucket, 'discord_name');
    assert.equal(classified?.candidateUserId, null);
    const input = { operationId: 'op1', jobId, expectedOwner: null, expectedRevision: 0,
      ownerUserId: 'u1', evidenceKind: 'admin_verified' as const, evidenceRef: 'case-1' };
    assert.throws(() => migrateJobOwner(db, { ...input, ownerUserId: 'name (discord)', evidenceKind: 'exact_user_id' }, 'admin'), /evidence_mismatch/);
    const first = migrateJobOwner(db, input, 'admin', 100);
    assert.equal(migrateJobOwner(db, input, 'admin', 101).applied, false);
    assert.throws(() => migrateJobOwner(db, { ...input, operationId: 'stale' }, 'admin'), /owner_conflict/);
    const rollback = rollbackJobOwner(db, first.auditId, 'rollback-1', 'admin', 102);
    assert.equal(rollback.revision, 2);
    assert.equal(getJob(db, jobId)?.owner_user_id, null);
    assert.throws(() => migrateJobOwner(db, { ...input, operationId: 'aba' }, 'admin'), /owner_conflict/);
    assert.throws(() => db.exec('DELETE FROM glab_job_owner_migration'), /append_only_audit/);
    const current = migrateJobOwner(db, { ...input, operationId: 'op2', expectedRevision: 2 }, 'admin', 103);
    assert.equal(current.revision, 3);
    assert.throws(() => rollbackJobOwner(db, first.auditId, 'rollback-old', 'admin'), /owner_conflict/);
  } finally { db.close(); }
});

test('new canonical owners are written without guessing a legacy postedBy', () => {
  const db = new DatabaseSync(':memory:');
  try {
    ensureSchema(db);
    const id = createJob(db, { company: 'Example', postedBy: 'u2', ownerUserId: 'u2' });
    assert.equal(getJob(db, id)?.owner_user_id, 'u2');
    assert.equal(getJob(db, id)?.owner_revision, 0);
  } finally { db.close(); }
});
