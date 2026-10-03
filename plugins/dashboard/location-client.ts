import type { CernereProjectApi } from '../cernere/shared-owner.ts';

export const LOCATIONS = ['unset', 'school', 'home', 'away'] as const;
export type MemberLocation = typeof LOCATIONS[number];
const declarations = new WeakMap<CernereProjectApi, Promise<void>>();

/** Location is self-reported user data, owned by Cernere, never inferred from attendance.
 * @implements SPEC-GLAB-SHELL-009
 */
async function ensureLocationSchema(client: CernereProjectApi): Promise<void> {
  let pending = declarations.get(client);
  if (!pending) {
    pending = client.call('managed_project', 'update_schema', {
      user_data: { columns: {
        current_location: { type: 'text', module: 'presence', nullable: true,
          description: '本人申告の現在地: school / home / away、未設定は null' },
      } },
    }).then(() => undefined).catch((error: unknown) => {
      declarations.delete(client);
      throw error;
    });
    declarations.set(client, pending);
  }
  await pending;
}

/** @implements SPEC-GLAB-SHELL-009 */
export async function getMemberLocation(client: CernereProjectApi, userId: string): Promise<MemberLocation> {
  await ensureLocationSchema(client);
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
  await ensureLocationSchema(client);
  await client.call('managed_project', 'set_user_data', {
    userId, data: { current_location: location === 'unset' ? null : location },
  });
}
