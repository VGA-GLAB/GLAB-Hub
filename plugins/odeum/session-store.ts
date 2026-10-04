// 発表セッション台帳 (glab_odeum_sessions) のクエリ。 スキーマは plugins/data.ts。
//
// 状態遷移は live → ended の一方向だけ。 ended からは戻さず、 再開は新しい
// セッションを作る。 1 イベントに live は 1 件 (部分 UNIQUE INDEX で保証)。

import { randomUUID } from 'node:crypto';
import type { SqlDb } from '../data.ts';

export type OdeumSessionStatus = 'live' | 'ended';

export interface OdeumSessionRow {
  id: string;
  eventId: number;
  presenterUserId: string;
  status: OdeumSessionStatus;
  startedAt: number;
  endedAt: number | null;
}

const COLUMNS = `id, event_id AS eventId, presenter_user_id AS presenterUserId,
  status, started_at AS startedAt, ended_at AS endedAt`;

export type StartResult =
  | { kind: 'created'; session: OdeumSessionRow }
  | { kind: 'resumed'; session: OdeumSessionRow }
  | { kind: 'conflict'; session: OdeumSessionRow };

/**
 * イベントの発表を始める。 同じ発表者の live があればそれを返し (アプリの再起動用)、
 * 別の人が発表中なら conflict を返す。
 */
export function startOdeumSession(
  db: SqlDb,
  input: { eventId: number; presenterUserId: string; now?: number; id?: string },
): StartResult {
  const existing = getLiveSessionForEvent(db, input.eventId);
  if (existing) {
    return existing.presenterUserId === input.presenterUserId
      ? { kind: 'resumed', session: existing }
      : { kind: 'conflict', session: existing };
  }
  const id = input.id ?? randomUUID();
  const startedAt = input.now ?? Date.now();
  try {
    db.prepare(`INSERT INTO glab_odeum_sessions
      (id, event_id, presenter_user_id, status, started_at, ended_at)
      VALUES (?, ?, ?, 'live', ?, NULL)`).run(id, input.eventId, input.presenterUserId, startedAt);
  } catch (error) {
    // 同時開始で部分 UNIQUE INDEX に当たった場合は、 勝った方の行で判定し直す。
    const winner = getLiveSessionForEvent(db, input.eventId);
    if (!winner) throw error;
    return winner.presenterUserId === input.presenterUserId
      ? { kind: 'resumed', session: winner }
      : { kind: 'conflict', session: winner };
  }
  return {
    kind: 'created',
    session: {
      id,
      eventId: input.eventId,
      presenterUserId: input.presenterUserId,
      status: 'live',
      startedAt,
      endedAt: null,
    },
  };
}

/** live のセッションだけを ended にする。 遷移したら true、 既に ended / 不在なら false。 */
export function endOdeumSession(db: SqlDb, id: string, now = Date.now()): boolean {
  const result = db.prepare(`UPDATE glab_odeum_sessions
    SET status = 'ended', ended_at = ? WHERE id = ? AND status = 'live'`).run(now, id);
  return Number(result.changes) > 0;
}

export function getOdeumSession(db: SqlDb, id: string): OdeumSessionRow | null {
  return (db.prepare(`SELECT ${COLUMNS} FROM glab_odeum_sessions WHERE id = ?`)
    .get(id) as OdeumSessionRow | undefined) ?? null;
}

export function getLiveSessionForEvent(db: SqlDb, eventId: number): OdeumSessionRow | null {
  return (db.prepare(`SELECT ${COLUMNS} FROM glab_odeum_sessions
    WHERE event_id = ? AND status = 'live'`).get(eventId) as OdeumSessionRow | undefined) ?? null;
}

export function listLiveOdeumSessions(db: SqlDb): OdeumSessionRow[] {
  return db.prepare(`SELECT ${COLUMNS} FROM glab_odeum_sessions
    WHERE status = 'live' ORDER BY started_at ASC`).all() as OdeumSessionRow[];
}
