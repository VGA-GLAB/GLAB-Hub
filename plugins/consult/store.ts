// consult モジュールのデータ層。
//
// glab_consult に触る SQL はここだけに置く。 route ハンドラに直書きすると
// SqlDb 単位のテストが書けず、 スキーマ変更の影響範囲も追えなくなる
// (spec/plan/2026-08-18-cleanup-backlog.md D2 / D6)。 テーブル定義そのものは
// CLAUDE.md のとおり plugins/data.ts に集約したままにする。

import type { SqlDb } from '../data.ts';

export interface ConsultRow {
  id: string;
  title: string;
  body: string;
  status: 'open' | 'resolved';
  thread_id: string | null;
  created_by: string;
  created_at: number;
  resolved_at: number | null;
  posted_at: number | null;
  invited_json: string | null;
  resolved_posted_at: number | null;
}

interface NewConsult {
  id: string;
  title: string;
  body: string;
  createdBy: string;
  createdAt: number;
  invitedJson: string;
}

/** 作成レート制限用。 窓内に同じ人の相談があれば true。 */
export function hasRecentConsult(db: SqlDb, createdBy: string, since: number): boolean {
  return db.prepare('SELECT id FROM glab_consult WHERE created_by = ? AND created_at > ? LIMIT 1')
    .get(createdBy, since) !== undefined;
}

export function insertConsult(db: SqlDb, consult: NewConsult): ConsultRow {
  db.prepare(`INSERT INTO glab_consult (id, title, body, status, created_by, created_at, invited_json)
    VALUES (?, ?, ?, 'open', ?, ?, ?)`).run(
    consult.id, consult.title, consult.body, consult.createdBy, consult.createdAt, consult.invitedJson,
  );
  return findConsult(db, consult.id) as ConsultRow;
}

export function findConsult(db: SqlDb, id: string): ConsultRow | null {
  return (db.prepare('SELECT * FROM glab_consult WHERE id = ?').get(id) as ConsultRow | undefined) ?? null;
}

export function listConsultsByStatus(db: SqlDb, status: 'open' | 'resolved'): ConsultRow[] {
  return db.prepare('SELECT * FROM glab_consult WHERE status = ? ORDER BY created_at DESC')
    .all(status) as ConsultRow[];
}

export function markConsultResolved(db: SqlDb, id: string, resolvedAt: number): void {
  db.prepare("UPDATE glab_consult SET status = 'resolved', resolved_at = ? WHERE id = ?").run(resolvedAt, id);
}

/** bot がまだスレッドを立てていない未解決の相談。 */
export function consultsPendingPost(db: SqlDb): ConsultRow[] {
  return db.prepare("SELECT * FROM glab_consult WHERE posted_at IS NULL AND status = 'open' ORDER BY created_at ASC")
    .all() as ConsultRow[];
}

/**
 * 解決済み × スレッド作成済み × bot 未処理のものだけを返す。 ack
 * (markConsultResolvedPosted) を受けた相談を返し続けると、 bot が毎 tick 同じ
 * スレッドを再アーカイブしてしまう。
 */
export function consultsPendingResolveNotice(db: SqlDb): ConsultRow[] {
  return db.prepare(`SELECT * FROM glab_consult
    WHERE status = 'resolved' AND thread_id IS NOT NULL AND resolved_posted_at IS NULL`)
    .all() as ConsultRow[];
}

/** 二度目の ack は false (成功を偽装しない)。 */
export function markConsultResolvedPosted(db: SqlDb, id: string, at: number): boolean {
  return db.prepare('UPDATE glab_consult SET resolved_posted_at = ? WHERE id = ? AND resolved_posted_at IS NULL')
    .run(at, id).changes > 0;
}

/** 二度目の post 記録は false (スレッドを付け替えない)。 */
export function markConsultPosted(db: SqlDb, id: string, threadId: string, at: number): boolean {
  return db.prepare('UPDATE glab_consult SET posted_at = ?, thread_id = ? WHERE id = ? AND posted_at IS NULL')
    .run(at, threadId, id).changes > 0;
}
