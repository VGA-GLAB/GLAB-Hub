import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ensureGlabUser,
  getGlabUser,
  listGlabUsers,
  type GlabUserRow,
  type SqlDb,
  type SqlStatement,
} from '../plugins/data.ts';

class UserDataDb implements SqlDb {
  readonly rows = new Map<string, GlabUserRow>();

  exec(): void {}

  prepare(sql: string): SqlStatement {
    return {
      get: (...params) => {
        if (sql.includes('FROM glab_user WHERE user_id')) {
          return this.rows.get(String(params[0]));
        }
        return undefined;
      },
      all: () => [...this.rows.values()].sort((a, b) => b.updated_at - a.updated_at),
      run: (...params) => {
        if (sql.includes('INSERT INTO glab_user')) {
          const userId = String(params[0]);
          if (this.rows.has(userId)) return { lastInsertRowid: 0, changes: 0 };
          this.rows.set(userId, {
            user_id: userId,
            attendance_status: 'unknown',
            created_at: Number(params[1]),
            updated_at: Number(params[2]),
            updated_by: null,
            attendance_event_id: null,
            attendance_checked_in_at: null,
          });
          return { lastInsertRowid: 1, changes: 1 };
        }
        return { lastInsertRowid: 0, changes: 0 };
      },
    };
  }
}

describe('GLAB user and attendance data', () => {
  it('creates one idempotent user_id row with unknown attendance', () => {
    const db = new UserDataDb();
    const first = ensureGlabUser(db, 'cernere-user-1');
    const second = ensureGlabUser(db, 'cernere-user-1');

    assert.equal(first.attendance_status, 'unknown');
    assert.equal(second.user_id, 'cernere-user-1');
    assert.equal(listGlabUsers(db).length, 1);
  });

  it('reads back the row it created (glab_user は参照行の確保だけを担う)', () => {
    const db = new UserDataDb();
    ensureGlabUser(db, 'cernere-user-2');

    assert.equal(getGlabUser(db, 'cernere-user-2')?.user_id, 'cernere-user-2');
    assert.equal(getGlabUser(db, 'missing-user'), null);
  });
});
