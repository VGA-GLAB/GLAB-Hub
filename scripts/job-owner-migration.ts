import { readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { classifyJobOwners } from '../plugins/jobs/owner-classification.ts';
import { migrateJobOwner, rollbackJobOwner, type OwnerMigrationInput } from '../plugins/jobs/owner-migration.ts';

// 操作者が明示した DB だけを開く。default path / 自動 schema 配備は持たない。
const [mode, databasePath, inputPath, actor, confirmation, ...extra] = process.argv.slice(2);
const writing = mode === 'apply' || mode === 'rollback';
if (!databasePath || !['classify', 'dry-run', 'apply', 'rollback'].includes(mode ?? '') || extra.length
  || (writing && (!inputPath || !actor?.trim() || confirmation !== '--approved'))
  || (!writing && (actor || confirmation)) || (mode === 'dry-run' && !inputPath)) {
  throw new Error('Usage: job-owner-migration.ts classify DB | dry-run DB INPUT.json | apply|rollback DB INPUT.json ACTOR --approved');
}
// ファイル不存在時に空 DB を生成しない。
if (!statSync(databasePath).isFile()) throw new Error('Database must be an existing file');
const db = new DatabaseSync(databasePath, { readOnly: !writing });
try {
  db.exec('PRAGMA busy_timeout = 5000');
  if (mode === 'classify') {
    process.stdout.write(JSON.stringify({ schemaMutation: false, jobs: classifyJobOwners(db) }, null, 2) + '\n');
  } else {
    const input: unknown = JSON.parse(readFileSync(inputPath!, 'utf8'));
    if (!Array.isArray(input)) throw new Error('Input must be an array');
    if (mode === 'dry-run') {
      const jobs = classifyJobOwners(db);
      const results = input.map((row: unknown) => {
        const entry = (typeof row === 'object' && row !== null ? row : {}) as Partial<OwnerMigrationInput>;
        const job = jobs.find((candidate) => candidate.jobId === entry.jobId);
        return { ...entry, bucket: job?.bucket ?? 'not_found',
          casMatches: !!job && job.ownerUserId === (entry.expectedOwner ?? null) && job.ownerRevision === entry.expectedRevision,
          evidenceReviewRequired: true };
      });
      process.stdout.write(JSON.stringify({ applied: false, results }, null, 2) + '\n');
    } else {
      const results = input.map((row: unknown) => {
        const entry = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>;
        const operationId = typeof entry.operationId === 'string' ? entry.operationId : undefined;
        try {
          if (typeof row !== 'object' || row === null) throw new Error('invalid_input_row');
          if (mode === 'apply') {
            // 詳細な形式検査は migrateJobOwner の validate() が行う。
            return { operationId, ...migrateJobOwner(db, entry as unknown as OwnerMigrationInput, actor!) };
          }
          if (operationId === undefined || typeof entry.auditId !== 'number') throw new Error('invalid_rollback');
          return { operationId, ...rollbackJobOwner(db, entry.auditId, operationId, actor!) };
        } catch (error) {
          process.exitCode = 1;
          return { operationId, error: error instanceof Error ? error.message : 'migration_failed' };
        }
      });
      process.stdout.write(JSON.stringify({ results }, null, 2) + '\n');
    }
  }
} finally {
  db.close();
}
