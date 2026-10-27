import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCompleteVantanUserProfile, translateVantanProfile, vantanUserInputSchema } from '../plugins/vantan-user/profile-schema.ts';
import { registrationInputSchema } from '../plugins/vantan-user/registration.ts';

test('alumni require name and role but may omit nickname, company, department and grade', () => {
  assert.equal(registrationInputSchema.safeParse({ memberType: 'alumni', name: 'OB', roleTitle: 'Member' }).success, true);
  for (const memberType of ['student', 'alumni']) {
    for (const missing of ['name', 'roleTitle']) {
      assert.equal(vantanUserInputSchema.safeParse({ memberType, name: 'Name', roleTitle: 'Member',
        departmentName: 'Games', grade: 2, [missing]: ' ' }).success, false);
    }
  }
});

test('students require department and positive integer grade', () => {
  const profile = { memberType: 'student', name: 'Name', roleTitle: 'Member', departmentName: 'Games', grade: 2 };
  assert.equal(registrationInputSchema.safeParse(profile).success, true);
  assert.equal(registrationInputSchema.safeParse({ ...profile, departmentName: '' }).success, false);
  for (const grade of [null, 0, -1, 1.5]) {
    assert.equal(registrationInputSchema.safeParse({ ...profile, grade }).success, false);
  }
});

test('the GLab gate recognizes stored alumni and requests membership for legacy records', () => {
  const profile = { name: 'Name', role_title: 'Member', department_name: 'Games' };
  assert.equal(isCompleteVantanUserProfile(translateVantanProfile(profile)), false);
  assert.equal(isCompleteVantanUserProfile(translateVantanProfile({ ...profile, member_type: 'alumni' })), true);
  assert.equal(isCompleteVantanUserProfile(translateVantanProfile({ ...profile, member_type: 'student' })), false);
  assert.equal(isCompleteVantanUserProfile(translateVantanProfile({ ...profile, member_type: 'student', grade: 2 })), true);
});
