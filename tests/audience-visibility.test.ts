import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canSee } from '../plugins/roles/audience.ts';

test('a thread with no audience is visible to everyone', () => {
  assert.equal(canSee(null, [], false, false), true);
  assert.equal(canSee([], ['student'], false, false), true);
});

test('a role-limited thread is visible only to intersecting roles', () => {
  assert.equal(canSee(['lead'], ['lead', 'planner'], false, false), true);
  assert.equal(canSee(['lead'], ['student'], false, false), false);
});

test('the author always sees their own thread', () => {
  assert.equal(canSee(['lead'], ['student'], true, false), true);
});

test('an admin sees everything', () => {
  assert.equal(canSee(['lead'], ['student'], false, true), true);
});

test('a user with no roles cannot see a role-limited thread', () => {
  assert.equal(canSee(['lead', 'planner'], [], false, false), false);
});
