// tech-links モジュールのデータ層。
//
// glab_tech_link / glab_tech_link_tag / glab_tech_link_comment に触る SQL は
// ここだけに置く (spec/plan/2026-08-18-cleanup-backlog.md D5 / D6)。
// 権限判定 (canEdit) と表示整形 (linkView) は route 側に残す。

import type { SqlDb } from '../data.ts';
import { normalizeLinkUrl } from './url.ts';

export interface LinkRow {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  memo: string | null;
  posted_by: string;
  source: 'web' | 'memoria';
  source_ref: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

interface LinkCommentRow {
  id: string;
  link_id: string;
  user_id: string;
  body: string;
  created_at: number;
}

interface LinkInput {
  url: string;
  title: string;
  summary?: string | undefined;
  memo?: string | undefined;
  tags?: string[] | undefined;
}

interface LinkPatch {
  title?: string | undefined;
  summary?: string | undefined;
  memo?: string | undefined;
}

interface LinkQuery {
  tag?: string | undefined;
  q?: string | undefined;
  limit: number;
  offset: number;
}

/** 検索語の LIKE メタ文字 (% _ \) を literal 化する (ESCAPE '\' 前提)。 */
function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, '\\$&')}%`;
}

export function tagsFor(db: SqlDb, linkId: string): string[] {
  return db.prepare('SELECT tag FROM glab_tech_link_tag WHERE link_id = ? ORDER BY tag ASC')
    .all(linkId).map((row) => (row as { tag: string }).tag);
}

/** タグは総入れ替え。 大小同一視のため小文字へ寄せてから重複を落とす。 */
export function replaceTags(db: SqlDb, linkId: string, tags: string[]): void {
  db.prepare('DELETE FROM glab_tech_link_tag WHERE link_id = ?').run(linkId);
  const insert = db.prepare('INSERT INTO glab_tech_link_tag (link_id, tag) VALUES (?, ?)');
  for (const tag of [...new Set(tags.map((value) => value.toLowerCase()))]) insert.run(linkId, tag);
}

export function findLink(db: SqlDb, id: string): LinkRow | null {
  return (db.prepare('SELECT * FROM glab_tech_link WHERE id = ? AND deleted_at IS NULL')
    .get(id) as LinkRow | undefined) ?? null;
}

/** URL を正規化して保存する。 正規化できない URL は null を返す (呼び出し側が 400)。 */
export function createLink(
  db: SqlDb, input: LinkInput, postedBy: string,
  source: 'web' | 'memoria', sourceRef: string | null,
): LinkRow | null {
  const normalizedUrl = normalizeLinkUrl(input.url);
  if (!normalizedUrl) return null;
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO glab_tech_link
    (id, url, title, summary, memo, posted_by, source, source_ref, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, normalizedUrl, input.title, input.summary ?? null, input.memo ?? null, postedBy, source, sourceRef, now, now);
  replaceTags(db, id, input.tags ?? []);
  return findLink(db, id) as LinkRow;
}

export function listLinks(db: SqlDb, query: LinkQuery): LinkRow[] {
  const clauses = ['l.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (query.tag) {
    clauses.push('EXISTS (SELECT 1 FROM glab_tech_link_tag t WHERE t.link_id = l.id AND t.tag = ?)');
    params.push(query.tag);
  }
  if (query.q) {
    clauses.push(`(l.title LIKE ? ESCAPE '\\' OR l.summary LIKE ? ESCAPE '\\'
      OR l.memo LIKE ? ESCAPE '\\' OR l.url LIKE ? ESCAPE '\\')`);
    const pattern = likeContains(query.q);
    params.push(pattern, pattern, pattern, pattern);
  }
  return db.prepare(`SELECT l.* FROM glab_tech_link l WHERE ${clauses.join(' AND ')}
    ORDER BY l.created_at DESC LIMIT ? OFFSET ?`).all(...params, query.limit, query.offset) as LinkRow[];
}

/** 未指定の項目は現在値を据え置く (undefined と明示的な null を区別する)。 */
export function updateLink(db: SqlDb, current: LinkRow, patch: LinkPatch): void {
  db.prepare('UPDATE glab_tech_link SET title = ?, summary = ?, memo = ?, updated_at = ? WHERE id = ?')
    .run(
      patch.title ?? current.title,
      patch.summary === undefined ? current.summary : patch.summary ?? null,
      patch.memo === undefined ? current.memo : patch.memo ?? null,
      Date.now(),
      current.id,
    );
}

/** 論理削除。 行は消さない (共有済みリンクの参照を壊さない)。 */
export function softDeleteLink(db: SqlDb, id: string): boolean {
  const now = Date.now();
  return db.prepare('UPDATE glab_tech_link SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .run(now, now, id).changes > 0;
}

export function listLinkComments(db: SqlDb, linkId: string): LinkCommentRow[] {
  return db.prepare('SELECT * FROM glab_tech_link_comment WHERE link_id = ? ORDER BY created_at ASC')
    .all(linkId) as LinkCommentRow[];
}

export function insertLinkComment(db: SqlDb, comment: {
  id: string; linkId: string; userId: string; body: string; createdAt: number;
}): void {
  db.prepare('INSERT INTO glab_tech_link_comment (id, link_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(comment.id, comment.linkId, comment.userId, comment.body, comment.createdAt);
}

export function listTagCounts(db: SqlDb): Array<{ tag: string; count: number }> {
  return db.prepare(`SELECT t.tag, COUNT(*) AS count FROM glab_tech_link_tag t
    JOIN glab_tech_link l ON l.id = t.link_id WHERE l.deleted_at IS NULL
    GROUP BY t.tag ORDER BY count DESC, t.tag ASC`).all() as Array<{ tag: string; count: number }>;
}

/** Memoria 共有の冪等判定。 同じ source_ref を同じ人が二度共有しても増やさない。 */
export function findSharedLink(db: SqlDb, sourceRef: string, postedBy: string): LinkRow | null {
  return (db.prepare(`SELECT * FROM glab_tech_link
    WHERE source = 'memoria' AND source_ref = ? AND posted_by = ? AND deleted_at IS NULL`)
    .get(sourceRef, postedBy) as LinkRow | undefined) ?? null;
}

/** 共有解除も論理削除。 呼び出し元 (posted_by) の行だけを対象にする。 */
export function unshareLink(db: SqlDb, sourceRef: string, postedBy: string): boolean {
  const now = Date.now();
  return db.prepare(`UPDATE glab_tech_link SET deleted_at = ?, updated_at = ?
    WHERE source = 'memoria' AND source_ref = ? AND posted_by = ? AND deleted_at IS NULL`)
    .run(now, now, sourceRef, postedBy).changes > 0;
}
