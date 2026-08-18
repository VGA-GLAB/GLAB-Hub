// spec/plan/2026-08-18-cleanup-backlog.md D1: glab_gateway の upsert と参照を
// 実 SQLite で検証する。 出席の attestation 検証はこのテーブルに載る Ostiarius
// 公開鍵だけを信頼するので、 二度目の登録が行を増やさず鍵を差し替えることを固定する。

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { findGateway, saveGateway } from '../plugins/data.ts';
import { openTempDb, type TempDb } from './sqlite-fixture.ts';

describe('glab_gateway', () => {
  let temp!: TempDb;

  before(() => { temp = openTempDb('glab-gateway-'); });
  after(() => { temp?.close(); });

  it('saves a gateway and reads it back by lan_id', () => {
    saveGateway(temp.db, {
      lanId: 'lan-1',
      facilityId: 'facility-a',
      publicKeyPem: '-----BEGIN PUBLIC KEY-----one-----END PUBLIC KEY-----',
      updatedAt: 1_000,
    });

    const row = findGateway(temp.db, 'lan-1');
    assert.equal(row?.facility_id, 'facility-a');
    assert.equal(row?.updated_at, 1_000);
    assert.ok(row?.public_key_pem.includes('one'));
  });

  it('replaces the key on a second save instead of adding a row', () => {
    saveGateway(temp.db, {
      lanId: 'lan-1',
      facilityId: 'facility-b',
      publicKeyPem: '-----BEGIN PUBLIC KEY-----two-----END PUBLIC KEY-----',
      updatedAt: 2_000,
    });

    const row = findGateway(temp.db, 'lan-1');
    assert.equal(row?.facility_id, 'facility-b');
    assert.equal(row?.updated_at, 2_000);
    assert.ok(row?.public_key_pem.includes('two'));
    assert.equal(
      temp.db.prepare('SELECT COUNT(*) AS n FROM glab_gateway').all().map((r) => (r as { n: number }).n)[0],
      1,
    );
  });

  it('returns null for an unknown lan_id (未登録は素通しさせない)', () => {
    assert.equal(findGateway(temp.db, 'lan-unknown'), null);
  });
});
