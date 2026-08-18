// roles モジュールのデータ層。
//
// glab_role_def / glab_member_role に触る SQL はここだけに置く
// (spec/plan/2026-08-18-cleanup-backlog.md D4 / D6)。 ある利用者の役職集合を引く
// resolveRoles は forum / events も使うので roles/audience.ts に残す。

import type { SqlDb } from '../data.ts';

interface RoleDefRow {
  key: string;
  label: string;
  sort: number;
}

interface MemberRoleRow {
  userId: string;
  role: string;
  createdAt: number;
}

export function listRoleDefs(db: SqlDb): RoleDefRow[] {
  return db.prepare('SELECT key, label, sort FROM glab_role_def ORDER BY sort ASC, key ASC')
    .all() as RoleDefRow[];
}

/** 同じ key の再登録は label / sort の更新 (重複行にしない)。 */
export function upsertRoleDef(db: SqlDb, def: RoleDefRow): void {
  db.prepare(`INSERT INTO glab_role_def (key, label, sort) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET label = excluded.label, sort = excluded.sort`)
    .run(def.key, def.label, def.sort);
}

export function deleteRoleDef(db: SqlDb, key: string): void {
  db.prepare('DELETE FROM glab_role_def WHERE key = ?').run(key);
}

export function listMembersByRole(db: SqlDb, role: string): MemberRoleRow[] {
  return db.prepare(`SELECT user_id AS userId, role, created_at AS createdAt
    FROM glab_member_role WHERE role = ? ORDER BY created_at ASC`).all(role) as MemberRoleRow[];
}

/** 同じ (user_id, role) の二度目は何もしない。 */
export function addMemberRole(db: SqlDb, userId: string, role: string, createdAt: number): void {
  db.prepare(`INSERT INTO glab_member_role (user_id, role, created_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id, role) DO NOTHING`).run(userId, role, createdAt);
}

export function removeMemberRole(db: SqlDb, userId: string, role: string): void {
  db.prepare('DELETE FROM glab_member_role WHERE user_id = ? AND role = ?').run(userId, role);
}
