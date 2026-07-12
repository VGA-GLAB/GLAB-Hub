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
}

export const GLAB_SCHEMA = `
CREATE TABLE IF NOT EXISTS glab_user (
  user_id             TEXT PRIMARY KEY,
  attendance_status   TEXT NOT NULL DEFAULT 'unknown'
    CHECK (attendance_status IN ('unknown', 'present', 'absent', 'late', 'excused')),
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  updated_by          TEXT
);
CREATE INDEX IF NOT EXISTS glab_user_attendance_status
  ON glab_user(attendance_status, updated_at);

CREATE TABLE IF NOT EXISTS glab_event (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  body          TEXT,
  location      TEXT,
  starts_at     INTEGER NOT NULL,
  created_by    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  notified_at   INTEGER,
  discord_message_id TEXT
);
CREATE INDEX IF NOT EXISTS glab_event_starts ON glab_event(starts_at);

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

-- 部員名簿 (管理者のみ閲覧)。 PII の正本は Cernere vantan_user — GLAB が氏名を持つのは
-- 「Cernere 未登録の部員」の間だけで、 user_id をリンクした時点で display_name を NULL 化し
-- 以後の氏名・学科は Cernere から表示時に引く (正本の二重化を作らない)。
-- discord_user_id / discord_handle は bot 連携の機能データとして保持し続ける。
CREATE TABLE IF NOT EXISTS glab_member (
  id              TEXT PRIMARY KEY,
  user_id         TEXT UNIQUE,
  display_name    TEXT,
  discord_user_id TEXT UNIQUE,
  discord_handle  TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invited', 'alumni', 'suspended')),
  club_role       TEXT,
  joined_at       INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  updated_by      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS glab_member_status ON glab_member(status, updated_at);
`;

export interface EventRow {
  id: number;
  title: string;
  body: string | null;
  location: string | null;
  starts_at: number;
  created_by: string;
  created_at: number;
  notified_at: number | null;
  discord_message_id: string | null;
}

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
  return result.changes > 0 ? getGlabUser(db, userId) : null;
}

// ─── イベント ────────────────────────────────────────────────

export interface NewEvent {
  title: string;
  body?: string | null;
  location?: string | null;
  startsAt: number;
  createdBy: string;
}

export function createEvent(db: SqlDb, e: NewEvent): number {
  const res = db
    .prepare(
      `INSERT INTO glab_event (title, body, location, starts_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(e.title, e.body ?? null, e.location ?? null, e.startsAt, e.createdBy, Date.now());
  return Number(res.lastInsertRowid);
}

/** 今後のイベント (starts_at >= now)。 includePast=true で全件。 */
export function listEvents(db: SqlDb, includePast = false): EventRow[] {
  if (includePast) {
    return db.prepare(`SELECT * FROM glab_event ORDER BY starts_at DESC`).all() as EventRow[];
  }
  return db
    .prepare(`SELECT * FROM glab_event WHERE starts_at >= ? ORDER BY starts_at ASC`)
    .all(Date.now()) as EventRow[];
}

export function getEvent(db: SqlDb, id: number): EventRow | null {
  return (db.prepare(`SELECT * FROM glab_event WHERE id = ?`).get(id) as EventRow) ?? null;
}

export function deleteEvent(db: SqlDb, id: number): boolean {
  return db.prepare(`DELETE FROM glab_event WHERE id = ?`).run(id).changes > 0;
}

export function markEventNotified(db: SqlDb, id: number, discordMessageId: string | null): void {
  db.prepare(`UPDATE glab_event SET notified_at = ?, discord_message_id = ? WHERE id = ?`).run(
    Date.now(),
    discordMessageId,
    id,
  );
}

/** 開始が now..now+windowMs に入り、 まだ通知していないイベント (リマインダ用)。 */
export function eventsDueForReminder(db: SqlDb, windowMs: number): EventRow[] {
  const now = Date.now();
  return db
    .prepare(
      `SELECT * FROM glab_event
       WHERE notified_at IS NULL AND starts_at >= ? AND starts_at <= ?
       ORDER BY starts_at ASC`,
    )
    .all(now, now + windowMs) as EventRow[];
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

// ── 部員名簿 (glab_member、 管理者のみ) ─────────────────────────────

export const MEMBER_STATUSES = ['active', 'invited', 'alumni', 'suspended'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export interface MemberRow {
  id: string;
  user_id: string | null;
  display_name: string | null;
  discord_user_id: string | null;
  discord_handle: string | null;
  status: MemberStatus;
  club_role: string | null;
  joined_at: number;
  updated_at: number;
  updated_by: string;
}

export interface NewMember {
  displayName: string;
  discordUserId?: string | null;
  discordHandle?: string | null;
  status?: MemberStatus;
  clubRole?: string | null;
}

export function createMember(db: SqlDb, m: NewMember, createdBy: string): MemberRow {
  const id = crypto.randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO glab_member
       (id, user_id, display_name, discord_user_id, discord_handle, status, club_role,
        joined_at, updated_at, updated_by)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    m.displayName,
    m.discordUserId ?? null,
    m.discordHandle ?? null,
    m.status ?? 'active',
    m.clubRole ?? null,
    now,
    now,
    createdBy,
  );
  return getMember(db, id)!;
}

export function getMember(db: SqlDb, id: string): MemberRow | null {
  return (db.prepare(`SELECT * FROM glab_member WHERE id = ?`).get(id) as MemberRow) ?? null;
}

export function listMembers(db: SqlDb): MemberRow[] {
  return db
    .prepare(`SELECT * FROM glab_member ORDER BY status ASC, joined_at ASC`)
    .all() as MemberRow[];
}

export interface MemberPatch {
  displayName?: string | null;
  discordUserId?: string | null;
  discordHandle?: string | null;
  status?: MemberStatus;
  clubRole?: string | null;
}

export function updateMember(db: SqlDb, id: string, patch: MemberPatch, updatedBy: string): MemberRow | null {
  const current = getMember(db, id);
  if (!current) return null;
  // リンク済み (user_id あり) の行に display_name を書き戻さない — 氏名の正本は Cernere。
  const displayName = current.user_id
    ? null
    : patch.displayName !== undefined ? patch.displayName : current.display_name;
  db.prepare(
    `UPDATE glab_member
     SET display_name = ?, discord_user_id = ?, discord_handle = ?, status = ?, club_role = ?,
         updated_at = ?, updated_by = ?
     WHERE id = ?`,
  ).run(
    displayName,
    patch.discordUserId !== undefined ? patch.discordUserId : current.discord_user_id,
    patch.discordHandle !== undefined ? patch.discordHandle : current.discord_handle,
    patch.status ?? current.status,
    patch.clubRole !== undefined ? patch.clubRole : current.club_role,
    Date.now(),
    updatedBy,
    id,
  );
  return getMember(db, id);
}

/**
 * 名簿行を Cernere ユーザにリンクする。 以後の氏名は Cernere vantan_user が正本になるため、
 * GLAB 側に残っていた display_name (未登録期間の PII) は同時に破棄する。
 */
export function linkMemberToUser(db: SqlDb, id: string, userId: string, updatedBy: string): MemberRow | null {
  const result = db.prepare(
    `UPDATE glab_member
     SET user_id = ?, display_name = NULL, updated_at = ?, updated_by = ?
     WHERE id = ? AND user_id IS NULL`,
  ).run(userId, Date.now(), updatedBy, id);
  if ((result as { changes?: number }).changes === 0) return null;
  return getMember(db, id);
}

export function deleteMember(db: SqlDb, id: string): boolean {
  const result = db.prepare(`DELETE FROM glab_member WHERE id = ?`).run(id);
  return ((result as { changes?: number }).changes ?? 0) > 0;
}

/** discord_handle だけあって数値 ID 未解決の部員 (bot の名前→ID 解決タスク用)。 */
export function membersNeedingDiscordResolution(db: SqlDb): MemberRow[] {
  return db
    .prepare(
      `SELECT * FROM glab_member
       WHERE discord_user_id IS NULL AND discord_handle IS NOT NULL AND discord_handle != ''`,
    )
    .all() as MemberRow[];
}

/** bot が Discord API で解決した数値 user ID を書き戻す。 */
export function setMemberDiscordUserId(db: SqlDb, id: string, discordUserId: string): boolean {
  const result = db.prepare(
    `UPDATE glab_member SET discord_user_id = ?, updated_at = ? WHERE id = ?`,
  ).run(discordUserId, Date.now(), id);
  return result.changes > 0;
}
