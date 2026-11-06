import type { ServiceIdentityProvider, ServiceUserSession } from '../../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../data.ts';
import { listProjectsWithMembers } from '../data.ts';

export interface BookingGroup { kind: 'organization' | 'team'; id: string; name: string; representative?: true }

/** Reads only the bound session's own current memberships. No global user WS.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
export async function readOrganizations(provider: ServiceIdentityProvider, session: ServiceUserSession,
  options: { withRepresentative?: boolean } = {}): Promise<BookingGroup[]> {
  const memberships = await provider.organizations(session);
  return memberships.map(item => ({ kind: 'organization', id: item.id, name: item.name,
    ...(options.withRepresentative && item.role === 'owner' ? { representative: true as const } : {}) }));
}

export function readTeams(db: SqlDb, userId: string): BookingGroup[] {
  return listProjectsWithMembers(db, { status: 'active' })
    .filter(project => project.members.some(member => member.user_id === userId))
    .map(project => ({ kind: 'team', id: project.id, name: project.name }));
}
