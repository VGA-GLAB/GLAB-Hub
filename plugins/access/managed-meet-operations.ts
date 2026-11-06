/** OAuth completion is important even though Google returns through GET.
 * Ae retains state, representative and meeting owner/audience authorization.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { approved, classify } from './operation-classification.ts';

export const managedMeetOperationPolicy: ServiceOperationPolicy = c => {
  const prefix = '/api/x/facility/meet/', path = c.req.path, method = c.req.method;
  if (!path.startsWith(prefix)) return null;
  const relative = path.slice(prefix.length);
  let action: string | undefined;
  if (relative === 'status' && method === 'GET') action = 'status.read';
  else if (relative === 'oauth/start' && method === 'POST') action = 'oauth.start';
  else if (relative === 'oauth/callback' && method === 'GET') action = 'oauth.complete';
  else if (/^[0-9a-f-]{36}$/i.test(relative) && ['GET', 'POST'].includes(method)) action = method === 'GET' ? 'read' : 'create';
  if (!action) return null;
  const callback = action === 'oauth.complete';
  return { ...classify('facility.meet.' + action, method === 'GET' && !callback ? 'sensitive_read' : 'important',
    (_context, identity) => identity.userId.trim().length > 0 && approved(identity), method === 'GET' ? 0 : 8192),
    ...(callback ? { privateQuery: true as const } : {}) };
};
