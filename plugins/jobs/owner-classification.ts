import type { SqlDb } from '../data.ts';

export interface ClassifiedJobOwner {
  jobId: number;
  ownerUserId: string | null;
  ownerRevision: number;
  candidateUserId: string | null;
  bucket: 'owned' | 'discord_name' | 'exact_user_id' | 'unmatched';
}

/** 読取専用。schema 未配備時も実データや schema に触れず分類する。 */
export function classifyJobOwners(db: SqlDb): ClassifiedJobOwner[] {
  const columns = db.prepare('PRAGMA table_info(glab_job)').all() as Array<{ name: string }>;
  const hasOwner = columns.some((column) => column.name === 'owner_user_id');
  const hasRevision = columns.some((column) => column.name === 'owner_revision');
  if (hasOwner !== hasRevision) throw new Error('incomplete_owner_schema');
  const owner = hasOwner ? 'j.owner_user_id' : 'NULL';
  const revision = hasRevision ? 'j.owner_revision' : '0';
  return db.prepare(`SELECT j.id AS jobId, ${owner} AS ownerUserId,
    ${revision} AS ownerRevision,
    CASE WHEN j.posted_by LIKE '% (discord)' THEN NULL
         WHEN EXISTS (SELECT 1 FROM glab_user u WHERE u.user_id = j.posted_by)
         THEN j.posted_by ELSE NULL END AS candidateUserId,
    CASE WHEN ${owner} IS NOT NULL THEN 'owned'
         WHEN j.posted_by LIKE '% (discord)' THEN 'discord_name'
         WHEN EXISTS (SELECT 1 FROM glab_user u WHERE u.user_id = j.posted_by)
         THEN 'exact_user_id' ELSE 'unmatched' END AS bucket
    FROM glab_job j ORDER BY j.id`).all() as ClassifiedJobOwner[];
}
