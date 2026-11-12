import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CernereProjectClient } from '../plugins/cernere/project-client.ts';
import { declarePresenceSchema } from '../plugins/cernere/presence-schema.ts';
import { PROFILE_COLUMNS } from '../plugins/cernere/profile-columns.ts';
import { PRESENCE_COLUMNS } from '../plugins/cernere/presence-columns.ts';
import { PROFILE_READ_COLUMNS } from '../plugins/vantan-user/profile-client.ts';

type ColumnDefinition = Record<string, unknown> & { _deleted?: boolean };
type Columns = Record<string, ColumnDefinition>;

/**
 * Cernere の managed_project.update_schema が user_data.columns をどう扱うかの再現。
 * 新しい宣言に無い旧列は DROP せず `_deleted: true` を付けて残す
 * (Cernere server/src/project/service.ts updateProjectSchema)。
 * 論理削除された列は get_user_data で返らず、ログイン時入力でも聞かれない。
 */
class CernereSchemaStub {
  columns: Columns;

  constructor(initial: Columns) {
    this.columns = structuredClone(initial);
  }

  async call(module: string, action: string, payload: Record<string, unknown>): Promise<unknown> {
    assert.equal(`${module}.${action}`, 'managed_project.update_schema');
    const declared = structuredClone((payload.user_data as { columns: Columns }).columns);
    for (const [name, definition] of Object.entries(this.columns)) {
      if (!(name in declared)) declared[name] = { ...definition, _deleted: true };
    }
    this.columns = declared;
    return { message: 'Schema updated' };
  }

  activeColumns(): string[] {
    return Object.entries(this.columns).filter(([, definition]) => !definition._deleted).map(([name]) => name);
  }
}

/** Cernere migration 078 / 079 適用後の glab の user_data (プロフィール列と presence 列が揃っている)。 */
function registeredGlabColumns(): Columns {
  return structuredClone({ ...PROFILE_COLUMNS, ...PRESENCE_COLUMNS }) as Columns;
}

describe('GLAB user_data declaration to Cernere', () => {
  it('keeps the profile columns GLAB reads active after the startup declaration', async () => {
    const cernere = new CernereSchemaStub(registeredGlabColumns());

    await declarePresenceSchema(cernere as unknown as CernereProjectClient, assert.fail);

    const active = cernere.activeColumns();
    // 論理削除されると GLAB は常に「未登録」と判定し、Cernere は入力画面を出さず、案内が消えなくなる。
    for (const column of PROFILE_READ_COLUMNS) assert.ok(active.includes(column), `${column} must stay declared`);
    for (const column of Object.keys(PRESENCE_COLUMNS)) assert.ok(active.includes(column), `${column} must stay declared`);
  });

  it('restores profile columns that an earlier presence-only declaration logically deleted', async () => {
    const deleted = Object.fromEntries(Object.entries(registeredGlabColumns()).map(([name, definition]) => [
      name, name in PROFILE_COLUMNS ? { ...definition, _deleted: true } : definition,
    ]));
    const cernere = new CernereSchemaStub(deleted);

    await declarePresenceSchema(cernere as unknown as CernereProjectClient, assert.fail);

    assert.deepEqual(cernere.activeColumns().sort(), Object.keys(registeredGlabColumns()).sort());
  });

  it('declares the profile columns with the module Cernere uses for the profile opt-out', () => {
    for (const column of PROFILE_READ_COLUMNS) assert.equal(PROFILE_COLUMNS[column].module, 'profile');
  });
});
