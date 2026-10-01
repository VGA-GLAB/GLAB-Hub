// cocoiru モジュールのデータ層。
//
// glab_cocoiru_* に触る SQL はここだけに置く (plugins/consult/store.ts と同じ流儀)。
// テーブル定義そのものは CLAUDE.md のとおり plugins/data.ts に集約したままにする。
// 個人情報は持たない: user_id・期限・呼び出し本文だけを扱う。

import type { SqlDb } from '../data.ts';

export type CocoiruCallKind = 'call' | 'tasukete';

export interface CocoiruCallRow {
  id: string;
  sender_id: string;
  recipient_id: string;
  title: string;
  body: string;
  kind: CocoiruCallKind;
  created_at: number;
  expires_at: number;
}

export interface NewCocoiruCall {
  id: string;
  senderId: string;
  recipientId: string;
  title: string;
  body: string;
  createdAt: number;
  expiresAt: number;
}

export interface TasuketeBroadcast {
  senderId: string;
  title: string;
  body: string;
  createdAt: number;
  expiresAt: number;
}

/** 在席 lease を upsert する。 lease は expiresAt を過ぎると無効になる。 */
export function upsertAvailability(db: SqlDb, userId: string, available: boolean, expiresAt: number): void {
  db.prepare(`INSERT INTO glab_cocoiru_availability (user_id, available, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET available = excluded.available, expires_at = excluded.expires_at`)
    .run(userId, available ? 1 : 0, expiresAt);
}

/** 期限切れの lease と call を消す (保持期間 = 期限まで)。 */
export function purgeExpired(db: SqlDb, now: number): void {
  db.prepare('DELETE FROM glab_cocoiru_availability WHERE expires_at <= ?').run(now);
  db.prepare('DELETE FROM glab_cocoiru_call WHERE expires_at <= ?').run(now);
}

/** 有効 (available=1 かつ未失効) な lease を持つ user_id。 */
export function listAvailableUserIds(db: SqlDb, now: number, limit = 100): string[] {
  const rows = db.prepare(`SELECT user_id FROM glab_cocoiru_availability
    WHERE available = 1 AND expires_at > ? ORDER BY user_id ASC LIMIT ?`).all(now, limit) as Array<{ user_id: string }>;
  return rows.map((row) => row.user_id);
}

export function hasActiveLease(db: SqlDb, userId: string, now: number): boolean {
  return db.prepare(`SELECT user_id FROM glab_cocoiru_availability
    WHERE user_id = ? AND available = 1 AND expires_at > ?`).get(userId, now) !== undefined;
}

/** 宛先の未失効 call 数 (受信箱の溢れ判定用)。 */
export function countPendingCalls(db: SqlDb, recipientId: string, now: number): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM glab_cocoiru_call WHERE recipient_id = ? AND expires_at > ?')
    .get(recipientId, now) as { n: number | bigint };
  return Number(row.n);
}

/** 同じ送信者が窓内に同じ相手へ call を送っていれば true。 */
export function hasRecentCall(db: SqlDb, senderId: string, recipientId: string, since: number): boolean {
  return db.prepare(`SELECT id FROM glab_cocoiru_call
    WHERE sender_id = ? AND kind = 'call' AND created_at > ? AND recipient_id = ? LIMIT 1`)
    .get(senderId, since, recipientId) !== undefined;
}

export function insertCall(db: SqlDb, call: NewCocoiruCall): void {
  db.prepare(`INSERT INTO glab_cocoiru_call (id, sender_id, recipient_id, title, body, kind, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 'call', ?, ?)`).run(
    call.id, call.senderId, call.recipientId, call.title, call.body, call.createdAt, call.expiresAt,
  );
}

/** 自分宛ての未失効 call を古い順に返す。 */
export function listInbox(db: SqlDb, recipientId: string, now: number, limit = 20): CocoiruCallRow[] {
  return db.prepare(`SELECT * FROM glab_cocoiru_call WHERE recipient_id = ? AND expires_at > ?
    ORDER BY created_at ASC, id ASC LIMIT ?`).all(recipientId, now, limit) as CocoiruCallRow[];
}

/** 自分宛てのその call だけを消す。 他人宛ての id を渡しても何も消さない。 */
export function acknowledgeCall(db: SqlDb, recipientId: string, id: string): boolean {
  return Number(db.prepare('DELETE FROM glab_cocoiru_call WHERE id = ? AND recipient_id = ?')
    .run(id, recipientId).changes) > 0;
}

/** 送信者が窓内に tasukete を送っていれば true。 */
export function hasRecentTasukete(db: SqlDb, senderId: string, since: number): boolean {
  return db.prepare(`SELECT id FROM glab_cocoiru_call
    WHERE sender_id = ? AND kind = 'tasukete' AND created_at > ? LIMIT 1`).get(senderId, since) !== undefined;
}

/**
 * 送信者以外の有効 lease 全員へ tasukete を一括作成し、作成件数を返す。
 * 1 文の INSERT ... SELECT なので、宛先の選定と作成の間に lease が変わっても部分作成にならない。
 */
export function broadcastTasukete(db: SqlDb, broadcast: TasuketeBroadcast): number {
  return Number(db.prepare(`INSERT INTO glab_cocoiru_call
      (id, sender_id, recipient_id, title, body, kind, created_at, expires_at)
    SELECT lower(hex(randomblob(16))), ?, user_id, ?, ?, 'tasukete', ?, ?
    FROM glab_cocoiru_availability
    WHERE available = 1 AND expires_at > ? AND user_id <> ?`).run(
    broadcast.senderId, broadcast.title, broadcast.body, broadcast.createdAt, broadcast.expiresAt,
    broadcast.createdAt, broadcast.senderId,
  ).changes);
}

/**
 * Discord ロビー secret を 1 行だけ持つ。 無ければ candidate を保存する。
 * 同時初回でも ON CONFLICT DO NOTHING で先着 1 つに収束し、全員が同じ値を読む。
 */
export function getOrCreateLobbySecret(db: SqlDb, candidate: string, now: number): string {
  db.prepare('INSERT INTO glab_cocoiru_lobby (id, secret, created_at) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING')
    .run(candidate, now);
  return (db.prepare('SELECT secret FROM glab_cocoiru_lobby WHERE id = 1').get() as { secret: string }).secret;
}
