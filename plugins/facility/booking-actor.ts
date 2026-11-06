import { getIdentity, getUserSession, type Context } from '../../corpus/server/hub/sdk.ts';
import { approved } from '../access/operation-classification.ts';

export class BookingActorUnavailable extends Error {
  constructor() { super('Current booking actor is unavailable'); }
}
/** GLAB-owned current admission checks complement the shared Cr session guard.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
export function currentBookingActor(c: Context): { userId: string; assertCurrent: () => void } {
  const subject = getIdentity(c).userId, session = getUserSession(c);
  const token = session?.token, binding = session?.grant.sessionBinding;
  const assertCurrent = (): void => {
    const identity = getIdentity(c), current = getUserSession(c);
    if (c.req.raw.signal.aborted || !subject || identity.userId !== subject || !approved(identity) || !current
      || !token || current.token !== token || current.grant.user.id !== subject || current.grant.sessionBinding !== binding
      || !Number.isFinite(Date.parse(current.grant.expiresAt)) || Date.parse(current.grant.expiresAt) <= Date.now()) throw new BookingActorUnavailable();
  };
  assertCurrent();
  return { userId: subject, assertCurrent };
}
