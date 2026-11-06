/** Current GLAB data authorization for presentation operations. No decision cache.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity } from '../../corpus/server/hub/sdk.ts';
import type { SqlDb } from '../data.ts';
import { readAdmission } from '../access/store.ts';
import { getEventStore, type EventRow } from '../events/store.ts';
import { canSee, parseAudience, resolveRoles } from '../roles/audience.ts';
import { getOdeumSession, type OdeumSessionRow } from './session-store.ts';
import { canEndPresentation, canStartPresentation } from './permissions.ts';

export interface SessionAccess {
  session: OdeumSessionRow;
  event: EventRow | null;
  visible: boolean;
  operator: boolean;
}
export type PresentationEventReader = Pick<ReturnType<typeof getEventStore>, 'get'>;

export class OdeumAuthorization {
  constructor(private readonly db: SqlDb, private readonly events: () => PresentationEventReader = getEventStore) {}

  member(identity: AuthIdentity): boolean {
    return identity.userId.length > 0 && (identity.isAdmin || readAdmission(this.db, identity.userId)?.status === 'approved');
  }
  visible(event: EventRow, identity: AuthIdentity): boolean {
    return canSee(parseAudience(event.audience_roles), resolveRoles(this.db, identity.userId), event.created_by === identity.userId, identity.isAdmin);
  }
  async start(eventId: number, identity: AuthIdentity): Promise<boolean> {
    if (!this.member(identity)) return false;
    const event = await this.events().get(eventId);
    return Boolean(event && this.member(identity) && this.visible(event, identity) && canStartPresentation(event, identity));
  }
  async session(id: string, identity: AuthIdentity): Promise<SessionAccess | null> {
    if (!this.member(identity)) return null;
    const before = getOdeumSession(this.db, id);
    if (!before) return null;
    const event = before.eventId == null ? null : await this.events().get(before.eventId);
    // PostgreSQL may yield. Re-read local session/admission/roles after it returns.
    const session = getOdeumSession(this.db, id);
    if (!session || session.eventId !== before.eventId || session.presenterUserId !== before.presenterUserId || !this.member(identity)) return null;
    return { session, event, visible: session.eventId == null || Boolean(event && this.visible(event, identity)),
      operator: canEndPresentation(session, event, identity) };
  }
}
