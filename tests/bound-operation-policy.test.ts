import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AuthIdentity, Context } from '../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../plugins/data.ts';
import { configureAdmissionPolicy } from '../plugins/access/policy.ts';
import { glabOperationPolicy } from '../plugins/access/operation-policy.ts';
import { attendanceOperationPolicy } from '../plugins/access/attendance-operations.ts';
import type { EventOccurrence } from '../plugins/events/recurrence.ts';

const identity: AuthIdentity = { userId: 'member', externalId: 'mapped', role: 'general', displayName: 'Member', projectKey: 'glab', isAdmin: false };
const context = (method: string, path: string, body: unknown = { featured: true }): Context => ({ req: { method, path, json: async () => body } } as unknown as Context);
function fixture() {
  const current = { approved: true, projectExists: true, member: true, evidence: true, request: true, roles: [] as string[] };
  configureAdmissionPolicy({ prepare: (sql: string) => ({
    all: () => {
      if (sql.includes('glab_member_role')) return current.roles.map(role => ({ role }));
      if (sql.includes('glab_event_attendance_approval')) return current.request ? [{ user_id: 'applicant' }] : [];
      throw new Error(`Unexpected resource query: ${sql}`);
    },
    get: () => {
      if (sql.includes('glab_admission')) return { status: current.approved ? 'approved' : 'rejected' };
      if (sql.includes('glab_project_member')) return current.member ? { yes: 1 } : undefined;
      if (sql.includes('glab_project')) return current.projectExists ? { id: 'project' } : undefined;
      if (sql.includes('glab_gps_photo')) return current.evidence ? { attendance_id: 'record' } : undefined;
      throw new Error(`Unexpected resource query: ${sql}`);
    },
  }) } as unknown as SqlDb);
  return current;
}
test('sensitive GET is explicitly classified and unknown routes/methods are denied', () => {
  fixture();
  assert.equal(glabOperationPolicy(context('GET', '/api/x/attendance/gps-photos/record'))?.risk, 'sensitive_read');
  assert.equal(glabOperationPolicy(context('GET', '/api/x/library/budget'))?.risk, 'sensitive_read');
  assert.equal(glabOperationPolicy(context('DELETE', '/api/x/library/budget')), null);
  assert.equal(glabOperationPolicy(context('GET', '/api/x/library/new-private-data')), null);
});

test('media uploads preserve the real profile media limits and latest GLAB admission', async () => {
  const current = fixture();
  for (const [kind, mebibytes] of [['screenshots', 20], ['voice-memos', 50], ['videos', 2048], ['game-logs', 100]] as const) {
    const c = context('PUT', `/api/x/volputas/evidence/media/${kind}/record`), operation = glabOperationPolicy(c);
    assert.equal(operation?.risk, 'important');
    assert.deepEqual(operation?.upload, { maximumBytes: mebibytes * 1024 * 1024, timeoutSeconds: 300 });
    assert.equal(operation?.maximumBodyBytes, mebibytes * 1024 * 1024);
    assert.equal(await operation?.authorizeResource(c, identity), true);
    current.approved = false; assert.equal(await operation?.authorizeResource(c, identity), false); current.approved = true;
    assert.equal(glabOperationPolicy(context('GET', c.req.path))?.risk, 'sensitive_read');
    assert.equal(glabOperationPolicy(context('GET', c.req.path + '/ticket'))?.risk, 'sensitive_read');
  }
  assert.equal(glabOperationPolicy(context('PUT', '/api/x/volputas/evidence/media/unknown/record')), null);
  assert.equal(glabOperationPolicy(context('PUT', '/api/x/volputas/evidence/media/videos/record/ticket')), null);
  assert.equal(glabOperationPolicy(context('PUT', '/api/x/volputas/evidence/media/video/record')), null);
});
test('Cr identity alone cannot replace live admission or project membership', async () => {
  const current = fixture(), c = context('PUT', '/api/x/projects/showcase/mine/project');
  const operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(await operation.authorizeResource(c, identity), true);
  current.member = false;
  assert.equal(await operation.authorizeResource(c, identity), false);
  const unlink = context('PUT', '/api/x/projects/showcase/mine/project', { featured: false });
  assert.equal(await operation.authorizeResource(unlink, identity), true);
  current.member = true; current.approved = false;
  assert.equal(await operation.authorizeResource(c, identity), false);
});
test('a sensitive evidence read checks the actual current record after admission', async () => {
  const current = fixture(), c = context('GET', '/api/x/attendance/gps-photos/record');
  const operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(await operation.authorizeResource(c, identity), true);
  current.evidence = false;
  assert.equal(await operation.authorizeResource(c, identity), false);
});
test('admission decisions are important and still require the GLAB administrator', async () => {
  fixture(); const c = context('PUT', '/api/x/access/requests/member');
  const operation = glabOperationPolicy(c); assert.ok(operation);
  assert.equal(operation.risk, 'important');
  assert.equal(await operation.authorizeResource(c, identity), false);
  assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), true);
});

test('attendance collections are sensitive and recheck current admission/admin ACLs', async () => {
  const current = fixture();
  const own = context('GET', '/api/x/attendance/mine'), list = context('GET', '/api/x/attendance/list');
  const ownOperation = glabOperationPolicy(own), listOperation = glabOperationPolicy(list);
  assert.equal(ownOperation?.risk, 'sensitive_read'); assert.equal(listOperation?.risk, 'sensitive_read');
  assert.equal(await ownOperation?.authorizeResource(own, identity), true);
  assert.equal(await listOperation?.authorizeResource(list, identity), false);
  assert.equal(await listOperation?.authorizeResource(list, { ...identity, isAdmin: true }), true);
  current.approved = false;
  assert.equal(await ownOperation?.authorizeResource(own, identity), false);
  assert.equal(glabOperationPolicy(context('GET', '/api/x/attendance/future-private-data')), null);
});

test('GPS checkin preserves the existing photo plus multipart byte limit and important classification', () => {
  fixture(); const operation = glabOperationPolicy(context('POST', '/api/x/attendance/checkin/gps'));
  assert.equal(operation?.risk, 'important');
  assert.equal(operation?.maximumBodyBytes, 10 * 1024 * 1024 + 64 * 1024);
  assert.equal(glabOperationPolicy(context('POST', '/api/x/attendance/automatic/targets'))?.risk, 'sensitive_read');
  assert.equal(glabOperationPolicy(context('PUT', '/api/x/attendance/checkin')), null);
});

test('event approval requires the current organizer, visible occurrence and actual pending request', async () => {
  const current = fixture();
  const event: EventOccurrence = { id: 1, title: 'Event', body: null, location: null, starts_at: 1, ends_at: null,
    facility_id: null, reservation_id: null, created_by: 'organizer', created_at: 0, notified_at: null,
    discord_message_id: null, audience_roles: '["staff"]', recurrence: 'none', occurrence_date: null };
  let exists = true;
  const policy = attendanceOperationPolicy(() => ({ list: async () => exists ? [event] : [] }));
  const c = context('POST', '/api/x/attendance/events/approve', { eventId: 1, startsAt: 1, userId: 'applicant' });
  const operation = policy(c); assert.ok(operation);
  assert.equal(await operation.authorizeResource(c, { ...identity, isAdmin: true }), false);
  const organizer = { ...identity, userId: 'organizer' };
  assert.equal(await operation.authorizeResource(c, organizer), true);
  current.request = false;
  assert.equal(await operation.authorizeResource(c, organizer), false);
  current.request = true; exists = false;
  assert.equal(await operation.authorizeResource(c, organizer), false);
  const request = context('POST', '/api/x/attendance/events/request', { eventId: 1, startsAt: 1 });
  const requestOperation = policy(request); assert.ok(requestOperation); exists = true;
  assert.equal(await requestOperation.authorizeResource(request, identity), false);
  current.roles = ['staff'];
  assert.equal(await requestOperation.authorizeResource(request, identity), true);
});
