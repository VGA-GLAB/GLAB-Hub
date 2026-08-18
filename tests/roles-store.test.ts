// spec/plan/2026-08-18-cleanup-backlog.md D4: glab_role_def / glab_member_role の
// CRUD と、 ensureSchema が投入する既定役職の seed を実 SQLite で検証する。
// 役職は forum の可視性 (audience) の入力なので、 seed が欠けると既存スレッドが
// 誰にも見えなくなる。

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { resolveRoles } from '../plugins/roles/audience.ts';
import {
  addMemberRole,
  deleteRoleDef,
  listMembersByRole,
  listRoleDefs,
  removeMemberRole,
  upsertRoleDef,
} from '../plugins/roles/store.ts';
import { openTempDb, type TempDb } from './sqlite-fixture.ts';

describe('glab_role_def / glab_member_role store', () => {
  let temp!: TempDb;

  before(() => { temp = openTempDb('glab-roles-'); });
  after(() => { temp?.close(); });

  it('ensureSchema seeds the default role definitions in sort order', () => {
    assert.deepEqual(
      listRoleDefs(temp.db).map((def) => def.key),
      ['lead', 'planner', 'programmer', 'designer', 'student'],
    );
    assert.equal(listRoleDefs(temp.db)[0]?.label, '運営');
  });

  it('upserts a definition instead of adding a duplicate key', () => {
    upsertRoleDef(temp.db, { key: 'sound', label: 'サウンド', sort: 5 });
    assert.equal(listRoleDefs(temp.db).length, 6);

    upsertRoleDef(temp.db, { key: 'sound', label: 'サウンド班', sort: 9 });
    const defs = listRoleDefs(temp.db);
    assert.equal(defs.length, 6);
    assert.equal(defs.find((def) => def.key === 'sound')?.label, 'サウンド班');
    assert.equal(defs.at(-1)?.key, 'sound');
  });

  it('assigns a member role at most once and lists the members oldest first', () => {
    addMemberRole(temp.db, 'user-2', 'lead', 2_000);
    addMemberRole(temp.db, 'user-1', 'lead', 1_000);
    addMemberRole(temp.db, 'user-1', 'lead', 3_000); // 二度目は何もしない

    assert.deepEqual(listMembersByRole(temp.db, 'lead').map((m) => m.userId), ['user-1', 'user-2']);
    assert.equal(listMembersByRole(temp.db, 'lead')[0]?.createdAt, 1_000);
    assert.deepEqual(listMembersByRole(temp.db, 'planner'), []);
  });

  it('resolveRoles returns every role held by one user', () => {
    addMemberRole(temp.db, 'user-1', 'programmer', 4_000);

    assert.deepEqual(resolveRoles(temp.db, 'user-1').sort(), ['lead', 'programmer']);
    assert.deepEqual(resolveRoles(temp.db, 'user-unknown'), []);
  });

  it('removes only the named assignment and definition', () => {
    removeMemberRole(temp.db, 'user-1', 'lead');
    assert.deepEqual(resolveRoles(temp.db, 'user-1'), ['programmer']);
    assert.deepEqual(listMembersByRole(temp.db, 'lead').map((m) => m.userId), ['user-2']);

    deleteRoleDef(temp.db, 'sound');
    assert.equal(listRoleDefs(temp.db).some((def) => def.key === 'sound'), false);
    assert.equal(listRoleDefs(temp.db).length, 5);
  });
});
