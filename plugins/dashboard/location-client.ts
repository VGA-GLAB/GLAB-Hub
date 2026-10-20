import type { CernereProjectApi } from '../cernere/shared-owner.ts';
import { declarePresenceSchema } from '../cernere/presence-schema.ts';

export const LOCATIONS = ['unset', 'school', 'home', 'away'] as const;
export type MemberLocation = typeof LOCATIONS[number];

/** @implements SPEC-GLAB-SHELL-009 */
export async function getMemberLocation(client: CernereProjectApi, userId: string): Promise<MemberLocation> {
  await declarePresenceSchema(client);
  const raw = await client.call('managed_project', 'get_user_data', {
    userId, columns: ['current_location'],
  });
  if (raw === null) return 'unset';
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid location response');
  const value = (raw as Record<string, unknown>).current_location;
  if (value === null || value === undefined || value === 'unset') return 'unset';
  if (value === 'school' || value === 'home' || value === 'away') return value;
  throw new Error('Invalid location value');
}

/** @implements SPEC-GLAB-SHELL-009 */
export async function setMemberLocation(client: CernereProjectApi, userId: string, location: MemberLocation): Promise<void> {
  await declarePresenceSchema(client);
  await client.call('managed_project', 'set_user_data', {
    userId, data: { current_location: location === 'unset' ? null : location },
  });
}
