/** Source admission complements Aedilis's own current booking-resource ACLs.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { approved, classify } from './operation-classification.ts';

export const facilityOperationPolicy: ServiceOperationPolicy = c => {
  const path = c.req.path, method = c.req.method;
  let action: string | null = null;
  let risk: 'read' | 'sensitive_read' | 'important' = 'read';
  if (method === 'GET' && path === '/api/x/facility/facilities') action = 'facility.list';
  else if (method === 'GET' && /^\/api\/x\/facility\/facilities\/[^/]+$/.test(path)) action = 'facility.read';
  else if (method === 'GET' && path === '/api/x/facility/reservations') { action = 'facility.reservations.list'; risk = 'sensitive_read'; }
  else if (method === 'GET' && path === '/api/x/facility/reservations/mine') { action = 'facility.reservations.own'; risk = 'sensitive_read'; }
  else if (method === 'POST' && path === '/api/x/facility/reservations') { action = 'facility.reservations.create'; risk = 'important'; }
  else if (['PATCH', 'DELETE'].includes(method) && /^\/api\/x\/facility\/reservations\/[0-9a-f-]{36}$/i.test(path)) {
    action = method === 'PATCH' ? 'facility.reservations.update' : 'facility.reservations.delete'; risk = 'important';
  }
  return action ? classify(action, risk, (_context, identity) => identity.userId.length > 0 && approved(identity)) : null;
};
