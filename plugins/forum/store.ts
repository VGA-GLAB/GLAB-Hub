// forum モジュールのデータ層。
//
// glab_forum_thread / glab_forum_comment に触る SQL はここだけに置く
// (spec/plan/2026-08-18-cleanup-backlog.md D3 / D6)。 可視性の判定 (canSee) は
// 役職を 1 リクエスト 1 回だけ引く都合で route 側に残す。

import type { SqlDb } from '../data.ts';

export interface ForumThreadRow {
  id: string;
  title: string;
  body: string;
  audience_roles: string | null;
  pinned: number;
  created_by: string;
  created_at: number;
  notified_at: number | null;
}

interface ForumCommentRow {
  id: string;
  thread_id: string;
  body: string;
  created_by: string;
  created_at: number;
}

interface NewForumThread {
  id: string;
  title: string;
  body: string;
  audienceRolesJson: string;
  createdBy: string;
  createdAt: number;
}

export function insertThread(db: SqlDb, thread: NewForumThread): ForumThreadRow {
  db.prepare(`INSERT INTO glab_forum_thread (id, title, body, audience_roles, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    thread.id, thread.title, thread.body, thread.audienceRolesJson, thread.createdBy, thread.createdAt,
  );
  return findThread(db, thread.id) as ForumThreadRow;
}

export function findThread(db: SqlDb, id: string): ForumThreadRow | null {
  return (db.prepare('SELECT * FROM glab_forum_thread WHERE id = ?').get(id) as ForumThreadRow | undefined)
    ?? null;
}

/** 検索語は本文・タイトルの部分一致。 可視性の絞り込みは呼び出し側が行う。 */
export function listThreads(db: SqlDb, q?: string): ForumThreadRow[] {
  const term = q?.trim();
  return db.prepare(`SELECT * FROM glab_forum_thread
    ${term ? 'WHERE title LIKE ? OR body LIKE ?' : ''} ORDER BY pinned DESC, created_at DESC`)
    .all(...(term ? [`%${term}%`, `%${term}%`] : [])) as ForumThreadRow[];
}

/** スレッドはコメントごと消す (コメントだけが残ると参照先を失う)。 */
export function deleteThread(db: SqlDb, id: string): void {
  db.prepare('DELETE FROM glab_forum_comment WHERE thread_id = ?').run(id);
  db.prepare('DELETE FROM glab_forum_thread WHERE id = ?').run(id);
}

/** 存在しないスレッドの pin は false (成功を偽装しない)。 */
export function pinThread(db: SqlDb, id: string): boolean {
  return db.prepare('UPDATE glab_forum_thread SET pinned = 1 WHERE id = ?').run(id).changes > 0;
}

export function listComments(db: SqlDb, threadId: string): ForumCommentRow[] {
  return db.prepare('SELECT * FROM glab_forum_comment WHERE thread_id = ? ORDER BY created_at ASC')
    .all(threadId) as ForumCommentRow[];
}

export function insertComment(db: SqlDb, comment: {
  id: string; threadId: string; body: string; createdBy: string; createdAt: number;
}): void {
  db.prepare(`INSERT INTO glab_forum_comment (id, thread_id, body, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)`).run(
    comment.id, comment.threadId, comment.body, comment.createdBy, comment.createdAt,
  );
}
