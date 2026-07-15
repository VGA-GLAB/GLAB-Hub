// GLAB 共有データ層 — ユーザ参照 / 出席状況 / イベント / 就活情報 / アンケート。
//
// このファイルは Web hub プラグイン (plugins/vantan-user, attendance, events, jobs, surveys。 Corpus の
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

CREATE TABLE IF NOT EXISTS glab_survey (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT NOT NULL,
  description   TEXT,
  questions     TEXT NOT NULL,
  is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  allow_multiple_responses INTEGER NOT NULL DEFAULT 0
    CHECK (allow_multiple_responses IN (0, 1)),
  created_by    TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS glab_survey_active
  ON glab_survey(is_active, created_at);

CREATE TABLE IF NOT EXISTS glab_survey_response (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id     INTEGER NOT NULL REFERENCES glab_survey(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  answers       TEXT NOT NULL,
  submitted_at  INTEGER NOT NULL,
  UNIQUE (survey_id, user_id)
);
CREATE INDEX IF NOT EXISTS glab_survey_response_user
  ON glab_survey_response(user_id, submitted_at);

CREATE TABLE IF NOT EXISTS glab_survey_submission (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  survey_id     INTEGER NOT NULL REFERENCES glab_survey(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  response_key  TEXT NOT NULL,
  answers       TEXT NOT NULL,
  submitted_at  INTEGER NOT NULL,
  UNIQUE (survey_id, user_id, response_key)
);
CREATE INDEX IF NOT EXISTS glab_survey_submission_user
  ON glab_survey_submission(user_id, submitted_at);
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

export interface SurveyRow {
  id: number;
  title: string;
  description: string | null;
  questions: string;
  is_active: 0 | 1;
  allow_multiple_responses: 0 | 1;
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface SurveyResponseRow {
  id: number;
  survey_id: number;
  user_id: string;
  answers: string;
  submitted_at: number;
}

/** スキーマ初期化 (冪等)。 plugins は ctx.db で、 bot は自前接続で 1 度呼ぶ。 */
export function ensureSchema(db: SqlDb): void {
  db.exec(GLAB_SCHEMA);
  ensureSurveyMultipleResponseColumn(db);
  migrateLegacySurveyResponses(db);
}

function ensureSurveyMultipleResponseColumn(db: SqlDb): void {
  const hasColumn = (): boolean => db.prepare(`PRAGMA table_info(glab_survey)`).all()
    .some((column) => (column as { name?: unknown }).name === 'allow_multiple_responses');
  if (hasColumn()) return;
  try {
    db.exec(
      `ALTER TABLE glab_survey ADD COLUMN allow_multiple_responses INTEGER NOT NULL DEFAULT 0
       CHECK (allow_multiple_responses IN (0, 1))`,
    );
  } catch (error) {
    // hub と Bot が同時起動してもう一方が先に追加した競合だけは成功として扱う。
    if (!hasColumn()) throw error;
  }
}

function migrateLegacySurveyResponses(db: SqlDb): void {
  db.exec(
    `INSERT OR IGNORE INTO glab_survey_submission
       (survey_id, user_id, response_key, answers, submitted_at)
     SELECT survey_id, user_id, 'single', answers, submitted_at
     FROM glab_survey_response`,
  );
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

// ─── アンケート ──────────────────────────────────────────────

export interface NewSurvey {
  title: string;
  description?: string | null;
  questions: string;
  allowMultipleResponses: boolean;
  createdBy: string;
  createdAt: number;
}

export function createSurvey(db: SqlDb, survey: NewSurvey): SurveyRow {
  const result = db.prepare(
    `INSERT INTO glab_survey
       (title, description, questions, is_active, allow_multiple_responses,
        created_by, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
  ).run(
    survey.title,
    survey.description ?? null,
    survey.questions,
    survey.allowMultipleResponses ? 1 : 0,
    survey.createdBy,
    survey.createdAt,
    survey.createdAt,
  );
  const created = getSurvey(db, Number(result.lastInsertRowid));
  if (!created) throw new Error('failed to create survey');
  return created;
}

export function listSurveys(db: SqlDb, includeInactive = false): SurveyRow[] {
  const sql = includeInactive
    ? `SELECT * FROM glab_survey ORDER BY created_at DESC, id DESC`
    : `SELECT * FROM glab_survey WHERE is_active = 1 ORDER BY created_at DESC, id DESC`;
  return db.prepare(sql).all() as SurveyRow[];
}

export function getSurvey(db: SqlDb, id: number): SurveyRow | null {
  return (db.prepare(`SELECT * FROM glab_survey WHERE id = ?`).get(id) as SurveyRow) ?? null;
}

export function setSurveyActive(
  db: SqlDb,
  id: number,
  isActive: boolean,
  updatedAt: number,
): SurveyRow | null {
  const result = db.prepare(
    `UPDATE glab_survey SET is_active = ?, updated_at = ? WHERE id = ?`,
  ).run(isActive ? 1 : 0, updatedAt, id);
  return result.changes > 0 ? getSurvey(db, id) : null;
}

export function getLatestSurveyResponse(
  db: SqlDb,
  surveyId: number,
  userId: string,
): SurveyResponseRow | null {
  return (db.prepare(
    `SELECT id, survey_id, user_id, answers, submitted_at
     FROM glab_survey_submission
     WHERE survey_id = ? AND user_id = ?
     ORDER BY submitted_at DESC, id DESC LIMIT 1`,
  ).get(surveyId, userId) as SurveyResponseRow) ?? null;
}

export function countSurveyResponses(db: SqlDb, surveyId: number, userId: string): number {
  const row = db.prepare(
    `SELECT COUNT(*) AS count FROM glab_survey_submission
     WHERE survey_id = ? AND user_id = ?`,
  ).get(surveyId, userId) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function saveSurveyResponse(
  db: SqlDb,
  surveyId: number,
  userId: string,
  responseKey: string,
  answers: string,
  submittedAt: number,
): SurveyResponseRow {
  db.prepare(
    `INSERT INTO glab_survey_submission
       (survey_id, user_id, response_key, answers, submitted_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(survey_id, user_id, response_key) DO UPDATE SET
       answers = excluded.answers,
       submitted_at = excluded.submitted_at`,
  ).run(surveyId, userId, responseKey, answers, submittedAt);
  const response = db.prepare(
    `SELECT id, survey_id, user_id, answers, submitted_at
     FROM glab_survey_submission
     WHERE survey_id = ? AND user_id = ? AND response_key = ?`,
  ).get(surveyId, userId, responseKey) as SurveyResponseRow | undefined;
  if (!response) throw new Error('failed to save survey response');
  return response;
}

export function listSurveyResponses(db: SqlDb, surveyId: number): SurveyResponseRow[] {
  return db.prepare(
    `SELECT id, survey_id, user_id, answers, submitted_at
     FROM glab_survey_submission
     WHERE survey_id = ? ORDER BY submitted_at DESC, id DESC`,
  ).all(surveyId) as SurveyResponseRow[];
}
