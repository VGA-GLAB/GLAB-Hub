// GLAB 共有データ層 — ユーザ参照 / 出席状況 / イベント / 就活情報。
//
// このファイルは Web hub プラグイン (plugins/vantan-user, attendance, events, jobs。 Corpus の
// `ctx.db` を使う) と Discord Bot (bot/。 better-sqlite3 を直接開く) の *両方* から
// import される。 両者は同じ SQLite ファイル (`data/corpus.db`、 WAL) を共有するため、
// スキーマとクエリをここに一元化して齟齬を防ぐ (DESIGN.md §4)。
//
// import 結合を避けるため、 DB は構造的な最小インターフェース (SqlDb) で受ける。
// Corpus の CorpusDb も better-sqlite3 の Database もこれを満たす。

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
