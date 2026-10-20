import type { CernereProjectApi } from '../cernere/shared-owner.ts';
import { declarePresenceSchema } from './presence-schema.ts';

/** Read only the signed-in member; header state does not require roster or Discord claims.
 * @implements SPEC-CONSULT-PRESENCE-005
 */
export async function getSelfAvailability(client: CernereProjectApi, userId: string, now: number): Promise<boolean> {
  await declarePresenceSchema(client);
  const raw = await client.call('managed_project', 'get_user_data', {
    userId, columns: ['available_now', 'available_until'],
  });
  if (raw === null) return false;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid self availability');
  const data = raw as Record<string, unknown>;
  const available = data.available_now;
  if (available == null || available === false) return false;
  if (available !== true) throw new Error('Invalid availability flag');
  if (data.available_until == null) return true;
  if (typeof data.available_until !== 'string') throw new Error('Invalid availability expiry');
  const expiresAt = Date.parse(data.available_until);
  if (!Number.isFinite(expiresAt)) throw new Error('Invalid availability expiry');
  return expiresAt > now;
}
