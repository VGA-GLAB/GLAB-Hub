import type { CernereProjectApi } from './shared-owner.ts';
import { declarePresenceSchema } from './presence-schema.ts';

export interface UserPermission { key: string; allowed: boolean; purpose: string | null }

/** @implements SPEC-GLAB-PERMISSIONS-001 */
export async function getUserPermissions(client: CernereProjectApi, userId: string): Promise<UserPermission[]> {
  await declarePresenceSchema(client);
  const raw = await client.call('managed_project', 'get_user_permissions', { userId });
  if (!raw || typeof raw !== 'object' || !('permissions' in raw) || !Array.isArray(raw.permissions)) {
    throw new Error('Invalid permission response');
  }
  return raw.permissions.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('key' in item) || typeof item.key !== 'string'
      || !('allowed' in item) || typeof item.allowed !== 'boolean') throw new Error('Invalid permission');
    return { key: item.key, allowed: item.allowed,
      purpose: 'purpose' in item && typeof item.purpose === 'string' ? item.purpose : null };
  });
}

export function canEditPresence(permissions: UserPermission[]): boolean {
  return permissions.some(p => p.key === 'user_data.module:presence' && p.allowed);
}
