/** Shared policy construction; decisions always read the current GLAB database.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, ClassifiedServiceOperation, Context } from '../../corpus/server/hub/sdk.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { readAdmission } from './store.ts';

export function approved(identity: AuthIdentity): boolean {
  const admission = readAdmission(currentAdmissionDatabase(), identity.userId);
  return identity.isAdmin || admission?.status === 'approved';
}
export function classify(action: string, risk: ClassifiedServiceOperation['risk'],
  authorizeResource: ClassifiedServiceOperation['authorizeResource'], maximumBodyBytes = 64 * 1024): ClassifiedServiceOperation {
  return { action, risk, authorizeResource, maximumBodyBytes };
}
export function selfResource(_c: Context, identity: AuthIdentity): boolean {
  // First sign-in has no admission row yet; endpoint resources are subject-bound.
  readAdmission(currentAdmissionDatabase(), identity.userId);
  return identity.userId.length > 0;
}
