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

CREATE TABLE IF NOT EXISTS glab_attendance (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  date          TEXT NOT NULL,
  facility_id   TEXT NOT NULL,
  checked_in_at INTEGER NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('passkey', 'manual')),
  event_id      INTEGER,
  detail        TEXT,
  UNIQUE(user_id, date, facility_id)
);
CREATE INDEX IF NOT EXISTS glab_attendance_date ON glab_attendance(date);
CREATE INDEX IF NOT EXISTS glab_attendance_user ON glab_attendance(user_id);

CREATE TABLE IF NOT EXISTS glab_gateway (
  lan_id         TEXT PRIMARY KEY,
  facility_id    TEXT NOT NULL,
  public_key_pem TEXT NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS glab_attendance_nonce (
  nonce   TEXT PRIMARY KEY,
  used_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS glab_attendance_nonce_used_at ON glab_attendance_nonce(used_at);

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

CREATE TABLE IF NOT EXISTS glab_tech_link (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  title       TEXT NOT NULL,
  summary     TEXT,
  memo        TEXT,
  posted_by   TEXT NOT NULL,
  source      TEXT NOT NULL CHECK(source IN ('web', 'memoria')),
  source_ref  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);
-- 一覧は 「未削除を新着順」 が唯一のホットパスなので複合索引で受ける。
CREATE INDEX IF NOT EXISTS glab_tech_link_live ON glab_tech_link(deleted_at, created_at);
CREATE INDEX IF NOT EXISTS glab_tech_link_source_ref ON glab_tech_link(source, source_ref);

CREATE TABLE IF NOT EXISTS glab_tech_link_tag (
  link_id TEXT NOT NULL REFERENCES glab_tech_link(id),
  tag     TEXT NOT NULL,
  UNIQUE(link_id, tag)
);
CREATE INDEX IF NOT EXISTS glab_tech_link_tag_tag ON glab_tech_link_tag(tag);

CREATE TABLE IF NOT EXISTS glab_tech_link_comment (
  id         TEXT PRIMARY KEY,
  link_id    TEXT NOT NULL REFERENCES glab_tech_link(id),
  user_id    TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS glab_tech_link_comment_link ON glab_tech_link_comment(link_id);

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

export interface AttendanceRow {
  id: string;
  user_id: string;
  date: string;
  facility_id: string;
  checked_in_at: number;
  source: 'passkey' | 'manual';
  event_id: number | null;
  detail: string | null;
}

export interface GatewayRow {
  lan_id: string;
  facility_id: string;
  public_key_pem: string;
  updated_at: number;
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

/** Volputas から受け取り、Discord へ未投稿のコミュニティ感想。 */
export interface ReviewRelayRow {
  reviewId: string;
  projectId: string | null;
  gameTitle: string;
  recommend: number | null;
  excerpt: string;
  author: string;
  url: string;
  createdAt: number;
  postedAt: number | null;
  messageId: string | null;
}

/** スキーマ初期化 (冪等)。 plugins は ctx.db で、 bot は自前接続で 1 度呼ぶ。 */
export function ensureSchema(db: SqlDb): void {
  db.exec(GLAB_SCHEMA);
  ensureAttendanceEventColumns(db);
  ensureProjectGitHubColumns(db);
  ensureReviewRelaySchema(db);
  db.exec(`CREATE TABLE IF NOT EXISTS glab_project_release (
    project_id TEXT NOT NULL REFERENCES glab_project(id), release_id INTEGER NOT NULL,
    tag TEXT NOT NULL, name TEXT NOT NULL, published_at TEXT NOT NULL, assets_json TEXT NOT NULL,
    synced_at INTEGER NOT NULL, notified_at INTEGER, PRIMARY KEY (project_id, release_id)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS glab_project_release_project ON glab_project_release(project_id, published_at DESC)');
  ensureCommunitySchema(db);
}

function ensureCommunitySchema(db: SqlDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS glab_role_def (
    key TEXT PRIMARY KEY, label TEXT NOT NULL, sort INTEGER NOT NULL DEFAULT 0
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS glab_member_role (
    user_id TEXT NOT NULL, role TEXT NOT NULL, created_at INTEGER NOT NULL,
    UNIQUE(user_id, role)
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS glab_forum_thread (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
    audience_roles TEXT, pinned INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL, notified_at INTEGER NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS glab_forum_comment (
    id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, body TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS glab_consult (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('open', 'resolved')),
    thread_id TEXT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
    resolved_at INTEGER NULL, posted_at INTEGER NULL, invited_json TEXT NULL,
    resolved_posted_at INTEGER NULL
  )`);
  // 先行ブランチで resolved_posted_at 無しの表を作った DB 向けの追い付き。
  ensureColumns(db, 'glab_consult', [['resolved_posted_at', 'INTEGER']]);
  db.exec('CREATE INDEX IF NOT EXISTS glab_forum_comment_thread ON glab_forum_comment(thread_id)');
  db.exec('CREATE INDEX IF NOT EXISTS glab_consult_posted_at ON glab_consult(posted_at)');
  db.exec('CREATE INDEX IF NOT EXISTS glab_consult_status ON glab_consult(status)');
  db.exec('CREATE INDEX IF NOT EXISTS glab_consult_resolved_posted_at ON glab_consult(resolved_posted_at)');
  // 相談作成のレート制限が毎回引く (created_by, created_at) 用。
  db.exec('CREATE INDEX IF NOT EXISTS glab_consult_created_by ON glab_consult(created_by, created_at)');
  for (const role of DEFAULT_ROLE_DEFS) {
    db.prepare(`INSERT INTO glab_role_def (key, label, sort) VALUES (?, ?, ?)
      ON CONFLICT(key) DO NOTHING`).run(role.key, role.label, role.sort);
  }
}

export const DEFAULT_ROLE_DEFS = [
  { key: 'lead', label: '運営', sort: 0 },
  { key: 'planner', label: '企画', sort: 1 },
  { key: 'programmer', label: 'プログラマ', sort: 2 },
  { key: 'designer', label: 'デザイナ', sort: 3 },
  { key: 'student', label: '学生', sort: 4 },
] as const;

function ensureReviewRelaySchema(db: SqlDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS glab_review_relay (
    review_id TEXT PRIMARY KEY,
    project_id TEXT NULL,
    game_title TEXT NOT NULL,
    recommend INTEGER NULL,
    excerpt TEXT NOT NULL,
    author TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    posted_at INTEGER NULL,
    message_id TEXT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS glab_review_relay_posted_at ON glab_review_relay(posted_at)');
}

export interface NewReviewRelay {
  reviewId: string;
  projectId: string | null;
  gameTitle: string;
  recommend: boolean | null;
  excerpt: string;
  author: string;
  url: string;
}

/** review_id を一意キーにして、再送 webhook を安全に無視する。 */
export function queueReviewRelay(db: SqlDb, review: NewReviewRelay): boolean {
  const result = db.prepare(
    `INSERT INTO glab_review_relay
      (review_id, project_id, game_title, recommend, excerpt, author, url, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(review_id) DO NOTHING`,
  ).run(
    review.reviewId,
    review.projectId,
    review.gameTitle,
    review.recommend === null ? null : review.recommend ? 1 : 0,
    review.excerpt,
    review.author,
    review.url,
    Date.now(),
  );
  return result.changes > 0;
}

/** 未投稿の感想を古い順に取得する。 */
export function reviewsForNotification(db: SqlDb, limit = 10): ReviewRelayRow[] {
  return db.prepare(
    `SELECT review_id AS reviewId, project_id AS projectId, game_title AS gameTitle,
      recommend, excerpt, author, url, created_at AS createdAt, posted_at AS postedAt,
      message_id AS messageId
     FROM glab_review_relay
     WHERE posted_at IS NULL
     ORDER BY created_at ASC
     LIMIT ?`,
  ).all(limit) as ReviewRelayRow[];
}

/** Discord API が成功を返した感想だけを投稿済みにする。 */
export function markReviewRelayPosted(db: SqlDb, reviewId: string, messageId: string): void {
  db.prepare(
    'UPDATE glab_review_relay SET posted_at = ?, message_id = ? WHERE review_id = ?',
  ).run(Date.now(), messageId, reviewId);
}

export interface ForumNotificationRow {
  id: string;
  title: string;
  body: string;
  audience_roles: string | null;
}

/** All-audience forum threads are the only threads eligible for Discord broadcast. */
export function forumThreadsForNotification(db: SqlDb, limit = 10): ForumNotificationRow[] {
  return db.prepare(`SELECT id, title, body, audience_roles FROM glab_forum_thread
    WHERE notified_at IS NULL AND (audience_roles IS NULL OR audience_roles = '[]')
    ORDER BY created_at ASC LIMIT ?`).all(limit) as ForumNotificationRow[];
}

export function markForumThreadNotified(db: SqlDb, id: string): void {
  db.prepare('UPDATE glab_forum_thread SET notified_at = ? WHERE id = ?').run(Date.now(), id);
}

function ensureAttendanceEventColumns(db: SqlDb): void {
  ensureColumns(db, 'glab_user', [
    ['attendance_event_id', 'INTEGER'],
    ['attendance_checked_in_at', 'INTEGER'],
  ]);
}

function ensureProjectGitHubColumns(db: SqlDb): void {
  ensureColumns(db, 'glab_project', [
    ['description_synced_at', 'INTEGER'],
    ['description_manual', 'INTEGER NOT NULL DEFAULT 0'],
    ['releases_synced_at', 'INTEGER'],
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

// ─── 出席台帳 ───────────────────────────────────────────────

export function dateInJst(timestamp: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function saveGateway(db: SqlDb, gateway: {
  lanId: string; facilityId: string; publicKeyPem: string; updatedAt?: number;
}): void {
  db.prepare(`INSERT INTO glab_gateway (lan_id, facility_id, public_key_pem, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(lan_id) DO UPDATE SET facility_id = excluded.facility_id,
      public_key_pem = excluded.public_key_pem, updated_at = excluded.updated_at`).run(
    gateway.lanId, gateway.facilityId, gateway.publicKeyPem, gateway.updatedAt ?? Date.now(),
  );
}

export function findGateway(db: SqlDb, lanId: string): GatewayRow | null {
  return (db.prepare(`SELECT lan_id, facility_id, public_key_pem, updated_at
    FROM glab_gateway WHERE lan_id = ?`).get(lanId) as GatewayRow | undefined) ?? null;
}

/**
 * attestation の鮮度窓 (120 秒) をはるかに超えた nonce は再提示されても stale で
 * 弾かれるため、 リプレイ判定に不要になる。 台帳と違い履歴的価値も無いので、
 * 予約のたびに保持期間を過ぎた行を掃除してテーブルの無制限な増加を防ぐ。
 */
const ATTENDANCE_NONCE_RETENTION_MS = 24 * 60 * 60 * 1000;

/** nonce は出席成功・同日冪等成功のいずれでも一度だけ使用できる。 */
export function reserveAttendanceNonce(db: SqlDb, nonce: string, usedAt = Date.now()): boolean {
  db.prepare('DELETE FROM glab_attendance_nonce WHERE used_at < ?')
    .run(usedAt - ATTENDANCE_NONCE_RETENTION_MS);
  return db.prepare(`INSERT INTO glab_attendance_nonce (nonce, used_at) VALUES (?, ?)
    ON CONFLICT(nonce) DO NOTHING`).run(nonce, usedAt).changes > 0;
}

export interface NewAttendance {
  userId: string;
  date: string;
  facilityId: string;
  checkedInAt: number;
  source: 'passkey' | 'manual';
  eventId?: number | null;
  detail?: Record<string, unknown> | null;
}

/** 同一ユーザ・日付・施設の二度目は書き換えず false を返す。 */
export function recordAttendance(db: SqlDb, attendance: NewAttendance): boolean {
  ensureGlabUser(db, attendance.userId);
  return db.prepare(`INSERT INTO glab_attendance
    (id, user_id, date, facility_id, checked_in_at, source, event_id, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date, facility_id) DO NOTHING`).run(
    randomUUID(), attendance.userId, attendance.date, attendance.facilityId,
    attendance.checkedInAt, attendance.source, attendance.eventId ?? null,
    attendance.detail == null ? null : JSON.stringify(attendance.detail),
  ).changes > 0;
}

export function listAttendance(db: SqlDb, query: {
  userId?: string; date?: string; facilityId?: string; from?: string; to?: string; limit?: number;
} = {}): AttendanceRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.userId) { where.push('user_id = ?'); params.push(query.userId); }
  if (query.date) { where.push('date = ?'); params.push(query.date); }
  if (query.facilityId) { where.push('facility_id = ?'); params.push(query.facilityId); }
  if (query.from) { where.push('date >= ?'); params.push(query.from); }
  if (query.to) { where.push('date <= ?'); params.push(query.to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit = query.limit ?? 100;
  return db.prepare(`SELECT id, user_id, date, facility_id, checked_in_at, source, event_id, detail
    FROM glab_attendance ${clause} ORDER BY checked_in_at DESC LIMIT ?`).all(...params, limit) as AttendanceRow[];
}

export function attendanceSummary(db: SqlDb, from: string, to: string): Array<{
  date: string; facilityId: string; count: number;
}> {
  return db.prepare(`SELECT date, facility_id AS facilityId, COUNT(*) AS count
    FROM glab_attendance WHERE date >= ? AND date <= ?
    GROUP BY date, facility_id ORDER BY date ASC, facility_id ASC`).all(from, to) as Array<{
    date: string; facilityId: string; count: number;
  }>;
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
  description_synced_at?: number | null;
  description_manual?: number;
  releases_synced_at?: number | null;
}

export interface ProjectReleaseRow {
  project_id: string;
  release_id: number;
  tag: string;
  name: string;
  published_at: string;
  assets_json: string;
  synced_at: number;
  notified_at: number | null;
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
  descriptionManual?: boolean;
}

export function createProject(db: SqlDb, input: NewProject): ProjectRow {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    `INSERT INTO glab_project (id, name, description, status, repo_url, description_manual, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
  ).run(id, input.name, input.description ?? null, input.repoUrl ?? null, input.description ? 1 : 0, now, now);
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
     SET name = ?, description = ?, status = ?, repo_url = ?, description_manual = ?, updated_at = ?
     WHERE id = ?`,
  ).run(patch.name, patch.description, patch.status, patch.repoUrl,
    patch.descriptionManual ? 1 : 0, Date.now(), id);
  return result.changes > 0 ? getProject(db, id) : null;
}

/** GitHub 同期は、運営者が手動編集した説明を上書きしない。 */
export function syncProjectGitHubDescription(db: SqlDb, id: string, description: string | null): void {
  const now = Date.now();
  db.prepare(
    `UPDATE glab_project SET description = ?, description_synced_at = ?, updated_at = ?
     WHERE id = ? AND COALESCE(description_manual, 0) = 0`,
  ).run(description, now, now, id);
}

/**
 * 初回同期で取り込んだ既存 Release は通知済みとして記録する。
 * これをしないと、 登録済みリポジトリを初めて同期した時点で過去の Release が全部 Discord に流れる。
 */
export function storeProjectReleases(
  db: SqlDb,
  projectId: string,
  releases: ReadonlyArray<{ releaseId: number; tag: string; name: string; publishedAt: string; assets: unknown }>,
): void {
  const syncedAt = Date.now();
  const project = db.prepare('SELECT releases_synced_at FROM glab_project WHERE id = ?').get(projectId) as
    { releases_synced_at?: number | null } | undefined;
  const backfill = !project?.releases_synced_at;
  for (const release of releases) {
    db.prepare(
      `INSERT INTO glab_project_release (project_id, release_id, tag, name, published_at, assets_json, synced_at, notified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id, release_id) DO UPDATE SET tag = excluded.tag, name = excluded.name,
         published_at = excluded.published_at, assets_json = excluded.assets_json, synced_at = excluded.synced_at`,
    ).run(projectId, release.releaseId, release.tag, release.name, release.publishedAt,
      JSON.stringify(release.assets), syncedAt, backfill ? syncedAt : null);
  }
  db.prepare('UPDATE glab_project SET releases_synced_at = ? WHERE id = ?').run(syncedAt, projectId);
}

export function listProjectReleases(db: SqlDb, projectId: string): ProjectReleaseRow[] {
  return db.prepare(
    `SELECT * FROM glab_project_release WHERE project_id = ? ORDER BY published_at DESC`,
  ).all(projectId) as ProjectReleaseRow[];
}

export function releasesForNotification(db: SqlDb, limit = 5): ProjectReleaseRow[] {
  return db.prepare(
    `SELECT * FROM glab_project_release WHERE notified_at IS NULL ORDER BY published_at ASC LIMIT ?`,
  ).all(limit) as ProjectReleaseRow[];
}

export function markProjectReleaseNotified(db: SqlDb, projectId: string, releaseId: number): void {
  db.prepare('UPDATE glab_project_release SET notified_at = ? WHERE project_id = ? AND release_id = ?')
    .run(Date.now(), projectId, releaseId);
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
