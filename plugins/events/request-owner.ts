/** Current source actor plus independent event ownership; never a credential.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import { getIdentity, type Context } from '../../corpus/server/hub/sdk.ts';
import { BookingActorUnavailable, currentBookingActor } from '../facility/booking-actor.ts';
import { EventOwnerRejected, type EventMutationOwner, type EventRow } from './store.ts';

export interface EventRequestOwner extends EventMutationOwner { assertOwner: (event: EventRow) => void }
export function currentEventOwner(c: Context): EventRequestOwner {
  const actor = currentBookingActor(c), isAdmin = getIdentity(c).isAdmin;
  const assertCurrent = (): void => {
    actor.assertCurrent();
    if (getIdentity(c).isAdmin !== isAdmin) throw new BookingActorUnavailable();
  };
  const assertOwner = (event: EventRow): void => {
    assertCurrent();
    if (event.created_by !== actor.userId && !isAdmin) throw new EventOwnerRejected('forbidden');
  };
  return { userId: actor.userId, isAdmin, assertCurrent, assertOwner };
}
