/** @implements SPEC-GLAB-BOUND-AUTH-001 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';

const identity: AuthIdentity = { userId: 'viewer', externalId: 'mapped', role: 'general', displayName: 'Viewer', projectKey: 'glab', isAdmin: false };
const admin = { ...identity, isAdmin: true, role: 'admin' };
const context = (method: string, path: string): Context => ({ req: { method, path } } as unknown as Context);
function fixture() {
  const state = { admitted: true, exists: true, active: true, member: true, published: true, projectId: '' };
  configureAdmissionPolicy({ prepare: (sql: string) => ({
    get: (id: string) => {
      if (sql.includes('glab_admission')) return { status: state.admitted ? 'approved' : 'rejected' };
      if (sql.includes('FROM glab_project WHERE id')) { state.projectId = id; return state.exists ? { id, status: state.active ? 'active' : 'completed' } : undefined; }
      throw new Error('Unexpected resource query');
    },
    all: () => {
      if (sql.includes('glab_project_member')) return state.member ? [{ user_id: identity.userId }] : [];
      if (sql.includes('glab_software_library')) return [{ id: 'release', published: state.published ? 1 : 0, metadata: '{}' }];
      throw new Error('Unexpected collection query');
    },
  }) } as unknown as SqlDb);
  return state;
}

test('project collections and named data are sensitive; current row and admission are rechecked', async () => {
  const state = fixture();
  for (const [path, action] of [
    ['projects', 'projects.list'], ['projects/id', 'projects.detail.read'], ['projects/id/releases', 'projects.releases.read'],
    ['projects/id/analysis-summary', 'projects.analysis.summary.read'], ['projects/id/analysis-files/omnipotens-final.html', 'projects.analysis.file.read'],
    ['teams/mine', 'teams.own.read'],
  ]) {
    const c = context('GET', '/api/x/projects/' + path), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, 'sensitive_read');
    assert.equal(await operation.authorizeResource(c, identity), true);
    state.admitted = false; assert.equal(await operation.authorizeResource(c, identity), false); state.admitted = true;
    if (path!.startsWith('projects/id')) {
      state.exists = false; assert.equal(await operation.authorizeResource(c, identity), false); state.exists = true;
    }
  }
});

test('TEAM detail needs active current membership, including for an administrator', async () => {
  const state = fixture(), c = context('GET', '/api/x/projects/teams/team%20id'), operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(operation.action, 'teams.detail.read'); assert.equal(await operation.authorizeResource(c, identity), true);
  assert.equal(state.projectId, 'team id');
  state.member = false; assert.equal(await operation.authorizeResource(c, admin), false); state.member = true;
  state.active = false; assert.equal(await operation.authorizeResource(c, identity), false); state.active = true;
  state.exists = false; assert.equal(await operation.authorizeResource(c, admin), false);
});

test('registry mutations and known-user PII require verified administration, with current target rows', async () => {
  const state = fixture();
  for (const [method, path, action] of [
    ['POST', 'projects', 'projects.create'], ['PATCH', 'projects/id', 'projects.update'], ['POST', 'projects/id/github-sync', 'projects.github.sync'],
    ['PUT', 'projects/id/members/user', 'projects.member.assign'], ['DELETE', 'projects/id/members/user', 'projects.member.remove'],
    ['GET', 'known-users', 'projects.known-users.read'],
  ]) {
    const c = context(method!, '/api/x/projects/' + path), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, method === 'GET' ? 'sensitive_read' : 'important');
    assert.equal(await operation.authorizeResource(c, identity), false);
    assert.equal(await operation.authorizeResource(c, { ...identity, role: 'admin' }), false);
    assert.equal(await operation.authorizeResource(c, admin), true);
    if (path!.startsWith('projects/id')) {
      state.exists = false; assert.equal(await operation.authorizeResource(c, admin), false); state.exists = true;
    }
  }
});

test('software metadata/publication management and recipient-bound download have distinct risks and bounds', async () => {
  const state = fixture();
  for (const [method, path, action, risk, bodyLimit, adminOnly] of [
    ['GET', 'entries', 'software.catalog.read', 'read', 65536, false],
    ['GET', 'manage', 'software.catalog.manage.read', 'sensitive_read', 65536, true],
    ['PUT', 'entries/release', 'software.entry.save', 'important', 16384, true],
    ['POST', 'download/release', 'software.release.download', 'sensitive_read', 8192, false],
  ] as const) {
    const c = context(method, '/api/x/software-library/' + path), operation = glabOperationPolicy(c); assert.ok(operation);
    assert.equal(operation.action, action); assert.equal(operation.risk, risk); assert.equal(operation.maximumBodyBytes, bodyLimit);
    assert.equal(await operation.authorizeResource(c, identity), !adminOnly); assert.equal(await operation.authorizeResource(c, admin), true);
    assert.equal(await operation.authorizeResource(c, { ...admin, userId: '' }), false);
  }
  const download = context('POST', '/api/x/software-library/download/release'), operation = glabOperationPolicy(download); assert.ok(operation);
  state.published = false; assert.equal(await operation.authorizeResource(download, identity), false); state.published = true;
  state.admitted = false; assert.equal(await operation.authorizeResource(download, identity), false);
});

test('unknown operations and external service mirrors receive no user classification', () => {
  fixture();
  for (const [method, path] of [
    ['GET', '/projects/projects/id/private'], ['DELETE', '/projects/projects/id'], ['PUT', '/projects/projects/id/members/%2F'],
    ['GET', '/projects/teams/%zz'], ['GET', '/projects/external/projects'], ['HEAD', '/projects/projects'],
    ['GET', '/software-library/download/release'], ['POST', '/software-library/entries'], ['PUT', '/software-library/entries/INVALID'],
  ]) assert.equal(glabOperationPolicy(context(method!, '/api/x' + path)), null);
});
