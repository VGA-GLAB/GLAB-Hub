import type { CernereProjectClient } from '../cernere/project-client.ts';
import type { VantanUserInput, VantanUserProfile } from './profile-schema.ts';
import { translateVantanProfile } from './profile-schema.ts';

const VANTAN_PROJECT_KEY = 'vantan_user';
const VANTAN_COLUMNS = ['name', 'role_title', 'department_name'] as const;

export async function getVantanUserProfile(
  client: CernereProjectClient,
  userId: string,
): Promise<VantanUserProfile> {
  const raw = await client.getUserData(userId, VANTAN_PROJECT_KEY, [...VANTAN_COLUMNS]);
  return translateVantanProfile(raw);
}

export async function setVantanUserProfile(
  client: CernereProjectClient,
  userId: string,
  profile: VantanUserInput,
): Promise<void> {
  await client.setUserData(userId, VANTAN_PROJECT_KEY, {
    name: profile.name,
    role_title: profile.roleTitle,
    department_name: profile.departmentName,
  });
}
