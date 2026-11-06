/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hono, type AuthIdentity, type Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import type { CernereProjectApi } from '../plugins/cernere/shared-owner.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { careerCompanyOperationPolicy } from '../plugins/access/career-company-operations.ts';
import { makeCareerCompanyRoutes } from '../plugins/tirocinium/career-company-routes.ts';

const identity: AuthIdentity = { userId: 'subject', externalId: 'subject', role: 'general', displayName: 'Subject', projectKey: 'glab', isAdmin: false };
const context = (method: string, path: string): Context => ({ req: { method, path } } as unknown as Context);
function fixture() {
  const state = { admitted: true, readFails: false, writeFails: false, reads: 0,
    writes: [] as { subject: string; data: Record<string, unknown> }[], onRead: () => {}, current: null as Context | null };
  configureAdmissionPolicy({ prepare: (sql: string) => ({ get: () => {
    assert.match(sql, /glab_admission/);
    return { status: state.admitted ? 'approved' : 'rejected' };
  } }) } as unknown as SqlDb);
  const client: CernereProjectApi = {
    getUserData: async (subject, project, columns) => {
      state.reads++;
      assert.equal(subject, identity.userId);
      assert.equal(project, 'tirocinium_student_career');
      assert.deepEqual(columns, ['desired_companies', 'offer_companies']);
      if (state.readFails) throw new Error('private-project-credential');
      state.onRead();
      return { desired_companies: [{ companyId: 'company', companyName: 'Private desired company', industry: '' }],
        offer_companies: [{ companyId: 'offer-company', companyName: 'Offer company', industry: '', roleTitle: '', offeredOn: null }] };
    },
    setUserData: async (subject, project, data) => {
      assert.equal(project, 'tirocinium_student_career');
      state.writes.push({ subject, data });
      if (state.writeFails) throw new Error('private-project-credential');
      return;
    },
    call: async () => assert.fail('No generic Cr operation is permitted by this fixture'),
  };
  const app = new Hono();
  app.use('*', async (c, next) => { c.set('auth', { ...identity }); state.current = c; await next(); });
  app.route('/', makeCareerCompanyRoutes(client));
  return { app, state };
}

test('three career actions require the current admitted subject and reject external target operations', async () => {
  const { state } = fixture();
  for (const [method, path, action] of [
    ['GET', '/career-companies', 'career.companies.self.read'],
    ['PUT', '/career-companies/desired/company', 'career.companies.self.update'],
    ['DELETE', '/career-companies/offer/company', 'career.companies.self.delete'],
  ]) {
    const c = context(method!, '/api/x/tirocinium' + path), operation = careerCompanyOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action);
    assert.equal(operation.risk, method === 'GET' ? 'sensitive_read' : 'important');
    assert.equal(await operation.authorizeResource(c, identity), true);
    state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
    assert.equal(await operation.authorizeResource(c, { ...identity, userId: '' }), false);
  }
  for (const [method, path] of [['GET', '/companies'], ['POST', '/calls'], ['POST', '/career-companies'],
    ['PUT', '/career-companies/internship/company'], ['PUT', '/career-companies/offer/%zz'],
    ['HEAD', '/career-companies'], ['DELETE', '/career-companies/desired/company/extra']]) {
    assert.equal(careerCompanyOperationPolicy(context(method!, '/api/x/tirocinium' + path)), null);
  }
});

test('real relation handlers use only the verified subject and preserve the other relation array', async () => {
  const { app, state } = fixture();
  const read = await app.request('/career-companies?userId=other');
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('cache-control'), 'private, no-store');
  assert.equal((await read.json() as { relations: unknown[] }).relations.length, 2);
  const put = await app.request('/career-companies/desired/company', { method: 'PUT', body: JSON.stringify({ userId: 'other', companyName: 'Replacement', industry: '' }) });
  assert.equal(put.status, 200);
  assert.equal(state.writes[0]?.subject, identity.userId);
  assert.deepEqual(state.writes[0]?.data.offer_companies, [{ companyId: 'offer-company', companyName: 'Offer company', industry: '', roleTitle: '', offeredOn: null }]);
  const deleted = await app.request('/career-companies/desired/company', { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.deepEqual(state.writes[1]?.data.desired_companies, []);
  assert.equal(state.writes[1]?.subject, identity.userId);
});

test('admission revoked during the Cr read discloses no private response and performs no mutation', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const { app, state } = fixture();
    state.onRead = () => { state.admitted = false; };
    const response = await app.request(method === 'GET' ? '/career-companies' : '/career-companies/desired/company', {
      method, ...(method === 'PUT' ? { body: JSON.stringify({ companyName: 'Replacement' }) } : {}),
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.ok(!(await response.text()).includes('Private desired company'));
    assert.equal(state.writes.length, 0);
  }
});

test('disconnect or changed actor during the Cr read cannot commit an earlier subject', async () => {
  for (const mode of ['abort', 'actor']) {
    const { app, state } = fixture(), controller = new AbortController();
    state.onRead = () => {
      if (mode === 'abort') controller.abort();
      else state.current?.set('auth', { ...identity, userId: 'another-subject' });
    };
    const response = await app.request('/career-companies/desired/company', { method: 'PUT',
      body: JSON.stringify({ companyName: 'Replacement' }), signal: controller.signal });
    assert.equal(response.status, mode === 'abort' ? 408 : 403);
    assert.equal(state.writes.length, 0);
  }
});

test('issuer failures expose stable codes and an unknown write result is never automatically retried', async () => {
  const { app, state } = fixture();
  state.readFails = true;
  const read = await app.request('/career-companies');
  assert.equal(read.status, 503); assert.ok(!(await read.text()).includes('private-project-credential'));
  state.readFails = false; state.writeFails = true;
  const write = await app.request('/career-companies/desired/company', { method: 'PUT', body: JSON.stringify({ companyName: 'Replacement' }) });
  assert.equal(write.status, 503); assert.ok(!(await write.text()).includes('private-project-credential'));
  assert.equal(state.writes.length, 1);
});
