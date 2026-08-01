import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dateInJst,
  listAttendance,
  reserveAttendanceNonce,
  type SqlDb,
  type SqlStatement,
} from '../plugins/data.ts';

interface Executed {
  sql: string;
  params: unknown[];
}

/** 実行された SQL とパラメータを記録するだけの SqlDb。 */
class RecordingDb implements SqlDb {
  readonly executed: Executed[] = [];
  rows: unknown[] = [];
  changes = 1;

  exec(): void {}

  prepare(sql: string): SqlStatement {
    const record = (params: unknown[]): void => {
      this.executed.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    };
    return {
      get: (...params) => { record(params); return undefined; },
      all: (...params) => { record(params); return this.rows; },
      run: (...params) => { record(params); return { lastInsertRowid: 0, changes: this.changes }; },
    };
  }
}

describe('JST ledger dates', () => {
  it('uses the Asia/Tokyo calendar day regardless of the host time zone', () => {
    // 2026-01-01T00:00:00Z は JST では既に 01-01 09:00。
    assert.equal(dateInJst(Date.UTC(2026, 0, 1, 0, 0, 0)), '2026-01-01');
    // UTC 15:00 = JST 翌日 00:00 ちょうど。
    assert.equal(dateInJst(Date.UTC(2026, 0, 1, 14, 59, 59)), '2026-01-01');
    assert.equal(dateInJst(Date.UTC(2026, 0, 1, 15, 0, 0)), '2026-01-02');
  });
});

describe('attendance ledger queries', () => {
  it('binds only the requested filters, and always binds the limit last', () => {
    const db = new RecordingDb();
    listAttendance(db, { userId: 'user-1', from: '2026-01-01', to: '2026-01-31' });

    const [query] = db.executed;
    assert.ok(query);
    assert.match(query.sql, /WHERE user_id = \? AND date >= \? AND date <= \?/);
    assert.doesNotMatch(query.sql, /facility_id = \?/);
    assert.deepEqual(query.params, ['user-1', '2026-01-01', '2026-01-31', 100]);
  });

  it('omits the WHERE clause entirely when no filter is given', () => {
    const db = new RecordingDb();
    listAttendance(db);

    const [query] = db.executed;
    assert.ok(query);
    assert.doesNotMatch(query.sql, /WHERE/);
    assert.deepEqual(query.params, [100]);
  });
});

describe('attendance nonce reservation', () => {
  it('prunes nonces older than the retention window before reserving', () => {
    const db = new RecordingDb();
    const usedAt = 1_800_000_000_000;
    assert.equal(reserveAttendanceNonce(db, 'nonce-1', usedAt), true);

    const [prune, insert] = db.executed;
    assert.ok(prune && insert);
    assert.match(prune.sql, /^DELETE FROM glab_attendance_nonce WHERE used_at < \?$/);
    // 保持期間は鮮度窓 (120 秒) より十分長いこと。 期限切れ nonce は stale で弾かれる。
    const retention = usedAt - Number(prune.params[0]);
    assert.ok(retention >= 24 * 60 * 60 * 1000, `retention was ${retention}ms`);
    assert.match(insert.sql, /INSERT INTO glab_attendance_nonce .* ON CONFLICT\(nonce\) DO NOTHING/);
    assert.deepEqual(insert.params, ['nonce-1', usedAt]);
  });

  it('reports a replay when the insert changes no row', () => {
    const db = new RecordingDb();
    db.changes = 0;
    assert.equal(reserveAttendanceNonce(db, 'nonce-1', 1_800_000_000_000), false);
  });
});
