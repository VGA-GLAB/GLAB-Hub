// GLAB 共有データ層 — ユーザ参照 / 出席状況 / イベント / 就活情報。
//
// このファイルは Web hub プラグイン (plugins/vantan-user, attendance, events, jobs。 Corpus の
// `ctx.db` を使う) と Discord Bot (bot/。 better-sqlite3 を直接開く) の *両方* から
// import される。 両者は同じ SQLite ファイル (`data/corpus.db`、 WAL) を共有するため、
// スキーマとクエリをここに一元化して齟齬を防ぐ (DESIGN.md §4)。
//
// import 結合を避けるため、 DB は構造的な最小インターフェース (SqlDb) で受ける。
// Corpus の CorpusDb も better-sqlite3 の Database もこれを満たす。

import { randomUUID } from 'node:crypto';

/** prepared statement の最小形。 */
export interface SqlStatement {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { lastInsertRowid: number | bigint; changes: number };
}

/** better-sqlite3 / CorpusDb が満たす最小 DB インターフェース。 */
export interface SqlDb {
  prepare(sql: string): SqlStatement;
  exec(sql: string): unknown;
  close?(): void;
}

export const GLAB_SCHEMA = `
CREATE TABLE IF NOT EXISTS glab_user (
  user_id             TEXT PRIMARY KEY,
  attendance_status   TEXT NOT NULL DEFAULT 'unknown'
    CHECK (attendance_status IN ('unknown', 'present', 'absent', 'late', 'excused')),
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  updated_by          TEXT,
  attendance_event_id INTEGER,
  attendance_checked_in_at INTEGER
);
CREATE INDEX IF NOT EXISTS glab_user_attendance_status
  ON glab_user(attendance_status, updated_at);

CREATE TABLE IF NOT EXISTS glab_job (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  company       TEXT NOT NULL,
  position      TEXT,
  category      TEXT,
  url           TEXT,
  body          TEXT,
  deadline_at   INTEGER,
  status        TEXT NOT NULL DEFAULT 'open',
  posted_by     TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  deadline_notified_at INTEGER
);
CREATE INDEX IF NOT EXISTS glab_job_status ON glab_job(status, deadline_at);

CREATE TABLE IF NOT EXISTS glab_project (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'closed')),
  repo_url    TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS glab_project_status ON glab_project(status, created_at);

-- project_member は Cernere user_id の参照のみを持つ (氏名等の個人属性は複製しない。
-- Cernere vantan_user が単一情報源。 表示名は corpus/server/db.ts の display-name
-- キャッシュを別途引く)。 Actio 側 tasks.project_id はこの id を不透明参照するだけで、
-- 逆方向 (このテーブルから Actio へ) のリンク列は持たない (最終裁定、pm-task-source.md)。
CREATE TABLE IF NOT EXISTS glab_project_member (
  project_id  TEXT NOT NULL REFERENCES glab_project(id),
  user_id     TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('producer', 'member')),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX IF NOT EXISTS glab_project_member_user ON glab_project_member(user_id);

`;

export const ATTENDANCE_STATUSES = [
  'unknown',
  'present',
  'absent',
  'late',
  'excused',
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface GlabUserRow {
  user_id: string;
  attendance_status: AttendanceStatus;
  created_at: number;
  updated_at: number;
  updated_by: string | null;
  attendance_event_id: number | null;
  attendance_checked_in_at: number | null;
}

export interface JobRow {
  id: number;
  company: string;
  position: string | null;
  category: string | null;
  url: string | null;
  body: string | null;
  deadline_at: number | null;
  status: string;
  posted_by: string;
  created_at: number;
  deadline_notified_at: number | null;
}

/** スキーマ初期化 (冪等)。 plugins は ctx.db で、 bot は自前接続で 1 度呼ぶ。 */
export function ensureSchema(db: SqlDb): void {
  db.exec(GLAB_SCHEMA);
  ensureAttendanceEventColumns(db);
}

function ensureAttendanceEventColumns(db: SqlDb): void {
  ensureColumns(db, 'glab_user', [
    ['attendance_event_id', 'INTEGER'],
    ['attendance_checked_in_at', 'INTEGER'],
  ]);
}

function ensureColumns(
  db: SqlDb,
  table: string,
  columns: ReadonlyArray<readonly [name: string, sqlType: string]>,
): void {
  const present = (): Set<string> => new Set(
    db.prepare(`PRAGMA table_info(${table})`).all()
      .map((column) => (column as { name?: unknown }).name)
      .filter((name): name is string => typeof name === 'string'),
  );
  let current = present();
  for (const [name, sqlType] of columns) {
    if (current.has(name)) continue;
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${sqlType}`);
    } catch (error) {
      current = present();
      if (!current.has(name)) throw error;
    }
    current.add(name);
  }
}

// ─── GLAB ユーザ / 現在の出席状況 ───────────────────────────

/** 初回アクセス時に Cernere user_id の参照行だけを GLAB に確保する。 */
export function ensureGlabUser(db: SqlDb, userId: string): GlabUserRow {
  const normalized = userId.trim();
  if (!normalized) throw new Error('userId is required');
  const now = Date.now();
  db.prepare(
    `INSERT INTO glab_user (user_id, attendance_status, created_at, updated_at)
     VALUES (?, 'unknown', ?, ?)
     ON CONFLICT(user_id) DO NOTHING`,
  ).run(normalized, now, now);
  const row = getGlabUser(db, normalized);
  if (!row) throw new Error('failed to ensure GLAB user');
  return row;
}

export function getGlabUser(db: SqlDb, userId: string): GlabUserRow | null {
  return (db.prepare(`SELECT * FROM glab_user WHERE user_id = ?`).get(userId) as GlabUserRow)
    ?? null;
}

export function listGlabUsers(db: SqlDb): GlabUserRow[] {
  return db.prepare(
    `SELECT * FROM glab_user ORDER BY updated_at DESC, user_id ASC`,
  ).all() as GlabUserRow[];
}

export function setAttendanceStatus(
  db: SqlDb,
  userId: string,
  status: AttendanceStatus,
  updatedBy: string,
): GlabUserRow | null {
  const result = db.prepare(
    `UPDATE glab_user
     SET attendance_status = ?, updated_at = ?, updated_by = ?
     WHERE user_id = ?`,
  ).run(status, Date.now(), updatedBy, userId);
  if (result.changes > 0 && status !== 'present') {
    db.prepare(
      `UPDATE glab_user
       SET attendance_event_id = NULL, attendance_checked_in_at = NULL
       WHERE user_id = ?`,
    ).run(userId);
  }
  return result.changes > 0 ? getGlabUser(db, userId) : null;
}

export function markAttendanceForEvent(
  db: SqlDb,
  userId: string,
  eventId: number,
  checkedInAt = Date.now(),
): GlabUserRow {
  ensureGlabUser(db, userId);
  db.prepare(
    `UPDATE glab_user
     SET attendance_status = 'present', updated_at = ?, updated_by = ?,
         attendance_event_id = ?, attendance_checked_in_at = ?
     WHERE user_id = ?`,
  ).run(checkedInAt, userId, eventId, checkedInAt, userId);
  const row = getGlabUser(db, userId);
  if (!row) throw new Error('failed to record event attendance');
  return row;
}

// ─── 就活情報 ────────────────────────────────────────────────

export interface NewJob {
  company: string;
  position?: string | null;
  category?: string | null;
  url?: string | null;
  body?: string | null;
  deadlineAt?: number | null;
  postedBy: string;
}

export function createJob(db: SqlDb, j: NewJob): number {
  const res = db
    .prepare(
      `INSERT INTO glab_job (company, position, category, url, body, deadline_at, status, posted_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    )
    .run(
      j.company,
      j.position ?? null,
      j.category ?? null,
      j.url ?? null,
      j.body ?? null,
      j.deadlineAt ?? null,
      j.postedBy,
      Date.now(),
    );
  return Number(res.lastInsertRowid);
}

export interface JobQuery {
  status?: 'open' | 'closed' | 'all';
  category?: string;
  /** company / position / body の部分一致。 */
  q?: string;
}

export function listJobs(db: SqlDb, query: JobQuery = {}): JobRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  const status = query.status ?? 'open';
  if (status !== 'all') {
    where.push(`status = ?`);
    params.push(status);
  }
  if (query.category) {
    where.push(`category = ?`);
    params.push(query.category);
  }
  if (query.q) {
    where.push(`(company LIKE ? OR position LIKE ? OR body LIKE ?)`);
    const like = `%${query.q}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  // 締切が近い順 (締切なしは末尾)、 次に新しい順
  return db
    .prepare(
      `SELECT * FROM glab_job ${clause}
       ORDER BY (deadline_at IS NULL) ASC, deadline_at ASC, created_at DESC`,
    )
    .all(...params) as JobRow[];
}

export function getJob(db: SqlDb, id: number): JobRow | null {
  return (db.prepare(`SELECT * FROM glab_job WHERE id = ?`).get(id) as JobRow) ?? null;
}

export function closeJob(db: SqlDb, id: number): boolean {
  return db.prepare(`UPDATE glab_job SET status = 'closed' WHERE id = ?`).run(id).changes > 0;
}

export function markJobDeadlineNotified(db: SqlDb, id: number): void {
  db.prepare(`UPDATE glab_job SET deadline_notified_at = ? WHERE id = ?`).run(Date.now(), id);
}

/** 締切が now..now+windowMs に入り、 open かつ未通知の求人 (締切リマインダ用)。 */
export function jobsDueForReminder(db: SqlDb, windowMs: number): JobRow[] {
  const now = Date.now();
  return db
    .prepare(
      `SELECT * FROM glab_job
       WHERE status = 'open' AND deadline_notified_at IS NULL
         AND deadline_at IS NOT NULL AND deadline_at >= ? AND deadline_at <= ?
       ORDER BY deadline_at ASC`,
    )
    .all(now, now + windowMs) as JobRow[];
}

// ─── 学生ゲーム制作 PJ レジストリ (glab_project / glab_project_member) ─────────
//
// Calliope docs/design/glab-pm.md §H2 の正本データ。 PJ 一件 = glab_project 一行。
// id は Actio コア tasks.project_id から不透明参照される値なので、 連番ではなく
// crypto.randomUUID() で発行する (Aedilis の予約 ID と同じ流儀)。
// glab_project_member は Cernere user_id の参照のみを持ち、 氏名等は保持しない
// (表示名は corpus/server/db.ts の getDisplayName キャッシュを別途引く)。

export const PROJECT_STATUSES = ['active', 'paused', 'closed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_MEMBER_ROLES = ['producer', 'member'] as const;
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number];

export interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  repo_url: string | null;
  created_at: number;
  updated_at: number;
}

export interface ProjectMemberRow {
  project_id: string;
  user_id: string;
  role: ProjectMemberRole;
  created_at: number;
}

export interface ProjectWithMembers extends ProjectRow {
  members: ProjectMemberRow[];
}

export interface NewProject {
  name: string;
  description?: string | null;
  repoUrl?: string | null;
}

/** 部分更新入力。 未指定キーは既存値を保持する (呼び出し側で merge して渡すこと)。 */
export interface ProjectPatch {
  name: string;
  description: string | null;
  status: ProjectStatus;
  repoUrl: string | null;
}

export function createProject(db: SqlDb, input: NewProject): ProjectRow {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO glab_project (id, name, description, status, repo_url, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?)`,
  ).run(id, input.name, input.description ?? null, input.repoUrl ?? null, now, now);
  const row = getProject(db, id);
  if (!row) throw new Error('failed to create project');
  return row;
}

export function getProject(db: SqlDb, id: string): ProjectRow | null {
  return (db.prepare(`SELECT * FROM glab_project WHERE id = ?`).get(id) as ProjectRow) ?? null;
}

export interface ProjectQuery {
  status?: ProjectStatus;
}

export function listProjects(db: SqlDb, query: ProjectQuery = {}): ProjectRow[] {
  if (query.status) {
    return db
      .prepare(`SELECT * FROM glab_project WHERE status = ? ORDER BY created_at DESC`)
      .all(query.status) as ProjectRow[];
  }
  return db
    .prepare(`SELECT * FROM glab_project ORDER BY created_at DESC`)
    .all() as ProjectRow[];
}

/** 呼び出し側が既存値と patch を merge した完全な値を渡す (read-modify-write)。 */
export function updateProject(db: SqlDb, id: string, patch: ProjectPatch): ProjectRow | null {
  const result = db.prepare(
    `UPDATE glab_project
     SET name = ?, description = ?, status = ?, repo_url = ?, updated_at = ?
     WHERE id = ?`,
  ).run(patch.name, patch.description, patch.status, patch.repoUrl, Date.now(), id);
  return result.changes > 0 ? getProject(db, id) : null;
}

export function listProjectMembers(db: SqlDb, projectId: string): ProjectMemberRow[] {
  return db
    .prepare(`SELECT * FROM glab_project_member WHERE project_id = ? ORDER BY created_at ASC`)
    .all(projectId) as ProjectMemberRow[];
}

/** メンバー追加、 既存なら role を更新する (upsert)。 */
export function upsertProjectMember(
  db: SqlDb,
  projectId: string,
  userId: string,
  role: ProjectMemberRole,
): ProjectMemberRow {
  db.prepare(
    `INSERT INTO glab_project_member (project_id, user_id, role, created_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`,
  ).run(projectId, userId, role, Date.now());
  const row = db
    .prepare(`SELECT * FROM glab_project_member WHERE project_id = ? AND user_id = ?`)
    .get(projectId, userId) as ProjectMemberRow | undefined;
  if (!row) throw new Error('failed to upsert project member');
  return row;
}

export function removeProjectMember(db: SqlDb, projectId: string, userId: string): boolean {
  return db
    .prepare(`DELETE FROM glab_project_member WHERE project_id = ? AND user_id = ?`)
    .run(projectId, userId).changes > 0;
}

function withMembers(db: SqlDb, row: ProjectRow): ProjectWithMembers {
  return { ...row, members: listProjectMembers(db, row.id) };
}

export function getProjectWithMembers(db: SqlDb, id: string): ProjectWithMembers | null {
  const row = getProject(db, id);
  return row ? withMembers(db, row) : null;
}

export function listProjectsWithMembers(
  db: SqlDb,
  query: ProjectQuery = {},
): ProjectWithMembers[] {
  return listProjects(db, query).map((row) => withMembers(db, row));
}
