import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';
import { classifyDownstreamOperation } from '../plugins/downstream-operations.ts';

const identity: AuthIdentity = { userId: 'member', externalId: 'mapped', role: 'general', displayName: 'Member', projectKey: 'glab', isAdmin: false };
const context = (method: string, suffix: string): Context => ({ req: { method, path: '/api/x/volputas' + suffix } } as unknown as Context);
function fixture() {
  const state = { admitted: true };
  configureAdmissionPolicy({ prepare: () => ({ get: () => ({ status: state.admitted ? 'approved' : 'rejected' }) }) } as unknown as SqlDb);
  return state;
}

test('Voluptas private GETs have explicit sensitive actions and recheck live GLAB admission', async () => {
  const state = fixture();
  for (const [suffix, action] of [['/surveys', 'survey.list'], ['/surveys/id', 'survey.read'], ['/reviews', 'review.list'],
    ['/reviews/id/follow-up', 'review.follow-up.read'], ['/reviews/analysis/id', 'review.analysis.read'],
    ['/recent-games', 'games.recent'], ['/games', 'games.list'], ['/evidence/emotion-curves', 'evidence.curves.read']]) {
    const c = context('GET', suffix!), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, 'sensitive_read');
    assert.equal(await operation.authorizeResource(c, identity), true);
    state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
  }
});

test('catalog management keeps the GLAB admin gate independently of the target admin check', async () => {
  fixture();
  for (const [method, suffix] of [['POST', '/surveys'], ['PATCH', '/surveys/id'], ['POST', '/games'], ['PATCH', '/games/id'], ['GET', '/games/admin']]) {
    const c = context(method!, suffix!), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.risk, method === 'GET' ? 'sensitive_read' : 'important');
    assert.equal(await operation.authorizeResource(c, identity), false);
    assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), true);
  }
});

test('owned writes/evaluation are important and use the target JSON byte ceiling', async () => {
  fixture();
  for (const [method, suffix] of [['PUT', '/surveys/id/response'], ['POST', '/reviews'], ['POST', '/reviews/id/follow-up'],
    ['POST', '/reviews/analysis/id'], ['POST', '/evidence/emotion-curves'], ['POST', '/evidence/emotion-curves/id/evaluate']]) {
    const operation = glabOperationPolicy(context(method!, suffix!)); assert.ok(operation);
    assert.equal(operation.risk, 'important'); assert.equal(operation.maximumBodyBytes, 1024 * 1024);
  }
});

test('catalog has its own action before record-id matching and retired alternate paths are not accepted', () => {
  fixture();
  assert.equal(glabOperationPolicy(context('GET', '/reviews/analysis/catalog'))?.action, 'review.analysis.catalog');
  assert.equal(glabOperationPolicy(context('GET', '/reviews/analysis/catalog'))?.risk, 'read');
  assert.equal(glabOperationPolicy(context('POST', '/reviews/analysis/catalog')), null);
  assert.deepEqual(classifyDownstreamOperation('voluptas', 'GET', '/api/v1/integrations/glab/reviews/analysis/catalog'), { action: 'review.analysis.catalog' });
  assert.deepEqual(classifyDownstreamOperation('voluptas', 'GET', '/api/v1/integrations/glab/reviews/recent-games'), { action: 'games.recent' });
  assert.equal(classifyDownstreamOperation('voluptas', 'GET', '/api/v1/integrations/glab/recent-games'), null);
  assert.equal(classifyDownstreamOperation('voluptas', 'POST', '/api/v1/integrations/glab/reviews/analysis/catalog'), null);
  assert.equal(classifyDownstreamOperation('volputas', 'GET', '/api/v1/integrations/glab/reviews/recent-games'), null);
  assert.equal(glabOperationPolicy(context('GET', '/unknown-private-data')), null);
  assert.equal(glabOperationPolicy(context('DELETE', '/reviews/id')), null);
});
