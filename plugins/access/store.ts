import type { SqlDb } from '../data.ts';
import type { Admission } from './contract.ts';

/** Only a verified Cernere service subject may be passed by the caller. */
export function recordRegistration(db: SqlDb, userId: string, now: number): void {
  db.prepare('INSERT INTO glab_admission(user_id, requested_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING')
    .run(userId, now);
}

export function readAdmission(db: SqlDb, userId: string): Admission | null {
  return db.prepare('SELECT user_id, status, requested_at, decided_by, decided_at, revision FROM glab_admission WHERE user_id = ?')
    .get(userId) as Admission | undefined ?? null;
}

export function listAdmissions(db: SqlDb): Admission[] {
  return db.prepare('SELECT user_id, status, requested_at, decided_by, decided_at, revision FROM glab_admission ORDER BY requested_at DESC LIMIT 500')
    .all() as Admission[];
}

export function decideAdmission(db: SqlDb, userId: string, status: 'approved' | 'rejected', revision: number, admin: string, now: number): boolean {
  return Number(db.prepare('UPDATE glab_admission SET status = ?, decided_by = ?, decided_at = ?, revision = revision + 1 WHERE user_id = ? AND revision = ?')
    .run(status, admin, now, userId, revision).changes) === 1;
}
