// ダッシュボードのデータ層。
//
// 「最近のアクティビティ」 は専用の監査表を持たず、 既存プラグインの表から
// 本人の行動だけを拾って時系列に畳む。 記録の正本はあくまで各プラグインの表で、
// ここは読み取り専用の集約に徹する (書き込み・削除は一切しない)。
// この方針にしたのは、 追加の書き込み経路を増やすと二重管理になり、 既存データ
// (過去の出席・投稿) が遡って空欄になるため。

import type { SqlDb } from '../data.ts';

/** アクティビティ 1 件の種別。 表示アイコン・文言は panel 側が持つ。 */
export type ActivityKind =
  | 'attendance'
  | 'tech-link'
  | 'tech-link-comment'
  | 'forum-thread'
  | 'forum-comment'
  | 'consult'
  | 'project-join';

export interface ActivityEntry {
  kind: ActivityKind;
  /** 出来事の対象名 (リンク名・スレッド名・施設 id など)。 */
  title: string;
  /** 発生時刻 (epoch ms)。 */
  at: number;
  /** 補足 (出席の打刻元など)。 無ければ null。 */
  detail: string | null;
}

interface RawActivityRow {
  kind: string;
  title: string | null;
  at: number | null;
  detail: string | null;
}

/** 本人の活動サマリ。 プロフィール欄の脇に出す件数。 */
export interface ActivityStats {
  /** 直近 30 日の出席日数。 */
  attendanceDays30: number;
  /** 参加中プロジェクト数。 */
  projects: number;
  /** 投稿した技術リンク数 (削除済みを除く)。 */
  techLinks: number;
  /** 立てたフォーラムスレッド + コメント数。 */
  forumPosts: number;
}

// 各表から「本人 / 時刻 / 表題」 の 3 列に正規化して UNION する。
// 表ごとに列名が違うだけで構造は同じなので、 1 本のクエリに畳んで
// 「新しい順に N 件」 を SQLite 側で決めさせる (アプリ側でのマージを避ける)。
const ACTIVITY_SQL = `
SELECT 'attendance' AS kind, a.facility_id AS title, a.checked_in_at AS at,
       a.source AS detail
  FROM glab_attendance a
 WHERE a.user_id = ?

UNION ALL
SELECT 'tech-link', l.title, l.created_at, NULL
  FROM glab_tech_link l
 WHERE l.posted_by = ? AND l.deleted_at IS NULL

UNION ALL
SELECT 'tech-link-comment', l.title, c.created_at, NULL
  FROM glab_tech_link_comment c
  JOIN glab_tech_link l ON l.id = c.link_id
 WHERE c.user_id = ? AND l.deleted_at IS NULL

UNION ALL
SELECT 'forum-thread', t.title, t.created_at, NULL
  FROM glab_forum_thread t
 WHERE t.created_by = ?

UNION ALL
SELECT 'forum-comment', t.title, fc.created_at, NULL
  FROM glab_forum_comment fc
  JOIN glab_forum_thread t ON t.id = fc.thread_id
 WHERE fc.created_by = ?

UNION ALL
SELECT 'consult', s.title, s.created_at, s.status
  FROM glab_consult s
 WHERE s.created_by = ?

UNION ALL
SELECT 'project-join', p.name, m.created_at, m.role
  FROM glab_project_member m
  JOIN glab_project p ON p.id = m.project_id
 WHERE m.user_id = ?

 ORDER BY at DESC
 LIMIT ?
`;

const KNOWN_KINDS: ReadonlySet<string> = new Set<ActivityKind>([
  'attendance',
  'tech-link',
  'tech-link-comment',
  'forum-thread',
  'forum-comment',
  'consult',
  'project-join',
]);

/**
 * 本人の最近のアクティビティを新しい順に返す。
 * 表題や時刻が欠けた行 (過去データの取りこぼし) は表示できないので落とす。
 * @implements SPEC-GLAB-SHELL-005
 */
export function listRecentActivity(
  db: SqlDb,
  userId: string,
  limit: number,
): ActivityEntry[] {
  const rows = db.prepare(ACTIVITY_SQL).all(
    userId, userId, userId, userId, userId, userId, userId, limit,
  ) as RawActivityRow[];
  const entries: ActivityEntry[] = [];
  for (const row of rows) {
    if (!KNOWN_KINDS.has(row.kind) || !row.title || row.at === null) continue;
    entries.push({
      kind: row.kind as ActivityKind,
      title: row.title,
      at: row.at,
      detail: row.detail,
    });
  }
  return entries;
}

/** @implements SPEC-GLAB-SHELL-005 */
function count(db: SqlDb, sql: string, ...params: unknown[]): number {
  const row = db.prepare(sql).get(...params) as { n: number } | undefined;
  return row?.n ?? 0;
}

/**
 * プロフィール脇に出す件数。 出席は「日数」 なので DISTINCT date で数える。
 * @implements SPEC-GLAB-SHELL-005
 */
export function readActivityStats(
  db: SqlDb,
  userId: string,
  since: number,
): ActivityStats {
  return {
    attendanceDays30: count(
      db,
      `SELECT COUNT(DISTINCT date) AS n FROM glab_attendance
        WHERE user_id = ? AND checked_in_at >= ?`,
      userId,
      since,
    ),
    projects: count(
      db,
      'SELECT COUNT(*) AS n FROM glab_project_member WHERE user_id = ?',
      userId,
    ),
    techLinks: count(
      db,
      `SELECT COUNT(*) AS n FROM glab_tech_link
        WHERE posted_by = ? AND deleted_at IS NULL`,
      userId,
    ),
    forumPosts: count(
      db,
      `SELECT (SELECT COUNT(*) FROM glab_forum_thread WHERE created_by = ?)
            + (SELECT COUNT(*) FROM glab_forum_comment WHERE created_by = ?) AS n`,
      userId,
      userId,
    ),
  };
}

/**
 * 本人に付いているロール (glab_member_role) を並び順つきで返す。
 * @implements SPEC-GLAB-SHELL-005
 */
export function listMemberRoles(db: SqlDb, userId: string): { key: string; label: string }[] {
  const rows = db.prepare(
    `SELECT r.key AS key, r.label AS label
       FROM glab_member_role m
       JOIN glab_role_def r ON r.key = m.role
      WHERE m.user_id = ?
      ORDER BY r.sort`,
  ).all(userId) as { key: string; label: string }[];
  return rows;
}
