import type { CernereProjectApi as CernereProjectClient } from '../cernere/shared-owner.ts';
import type { VantanUserInput, VantanUserProfile } from './profile-schema.ts';
import { translateVantanProfile } from './profile-schema.ts';

const PROFILE_PROJECT_KEY = 'glab';
const PROFILE_COLUMNS = ['name', 'role_title', 'department_name', 'member_type', 'nickname', 'grade', 'company'] as const;

export async function getVantanUserProfile(
  client: CernereProjectClient,
  userId: string,
): Promise<VantanUserProfile> {
  const raw = await client.getUserData(userId, PROFILE_PROJECT_KEY, [...PROFILE_COLUMNS]);
  return translateVantanProfile(raw);
}

export async function setVantanUserProfile(
  client: CernereProjectClient,
  userId: string,
  profile: VantanUserInput,
): Promise<void> {
  await client.setUserData(userId, PROFILE_PROJECT_KEY, {
    name: profile.name,
    role_title: profile.roleTitle,
    department_name: profile.memberType === 'student' ? profile.departmentName : null,
    member_type: profile.memberType,
    nickname: profile.nickname,
    grade: profile.memberType === 'student' ? profile.grade : null,
    company: profile.memberType === 'alumni' ? profile.company : null,
  });
}
