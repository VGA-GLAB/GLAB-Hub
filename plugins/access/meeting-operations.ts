/** Poll/answer ownership stays on Aedilis; GLAB checks current subject admission.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { approved, classify } from './operation-classification.ts';

export const meetingOperationPolicy: ServiceOperationPolicy = c => {
  const prefix = '/api/x/facility/meetings', method = c.req.method;
  const path = c.req.path;
  if (path !== prefix && !path.startsWith(prefix + '/')) return null;
  const relative = path.slice(prefix.length);
  let action: string | null = null;
  if (method === 'GET' && relative === '') action = 'list.read';
  else if (method === 'GET' && relative === '/mine') action = 'mine.read';
  else if (method === 'POST' && relative === '') action = 'create';
  else {
    const parts = relative.slice(1).split('/');
    if (!/^[0-9a-f-]{36}$/i.test(parts[0] ?? '')) return null;
    if (parts.length === 1) {
      if (method === 'GET') action = 'read';
      if (method === 'PATCH') action = 'update';
      if (method === 'DELETE') action = 'cancel';
    } else if (parts.length === 2 && method === 'POST') {
      if (parts[1] === 'finalize') action = 'finalize';
      if (parts[1] === 'glab-event') action = 'glab-event.finalize';
      if (parts[1] === 'responses') action = 'response.create';
    } else if (parts.length === 3 && parts[1] === 'responses' && /^[0-9a-f-]{36}$/i.test(parts[2] ?? '') && method === 'PATCH') action = 'response.update';
  }
  return action ? classify('facility.meetings.' + action, method === 'GET' ? 'sensitive_read' : 'important',
    (_ctx, identity) => identity.userId.length > 0 && approved(identity)) : null;
};
