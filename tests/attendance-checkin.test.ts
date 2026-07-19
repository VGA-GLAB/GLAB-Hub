import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeRoutes } from '../plugins/attendance/index.ts';
import type { CorpusContext } from '../corpus/server/hub/sdk.ts';
import type { VersionedHttpServiceConnector } from '../plugins/service-health-connector.ts';

// makeRoutes はハンドラ内で ctx.db / connector / event store を遅延参照するだけなので、
// ルーティング (存在するルートかどうか) の検証には最小スタブで足りる。
const stubCtx = { db: {} } as unknown as CorpusContext;
const stubConnector = {} as unknown as VersionedHttpServiceConnector;

function app() {
  return makeRoutes(stubCtx, stubConnector, stubConnector);
}

describe('attendance routes', () => {
  // 回帰ガード: イベント検証を伴わない自己申告出席 (self-service checkin) は撤去済み。
  // このルートが復活すると「イベントが無いのに出席登録できる」デグレが再発する。
  it('does not expose self-service checkin (POST /mine/checkin is removed → 404)', async () => {
    const res = await app().request('/mine/checkin', { method: 'POST' });
    assert.equal(res.status, 404);
  });

  // 正規の出席は event-gated な POST /checkin のみ (attestation 必須 → 空 body は 400、404 ではない)。
  it('keeps the event-gated POST /checkin route', async () => {
    const res = await app().request('/checkin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.notEqual(res.status, 404);
  });
});
