/** GLAB admission is checked here; Voluptas owns current record/asset permissions.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { AuthIdentity, Context, ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { approved, classify } from './operation-classification.ts';

// ProfileMediaStore.MEDIA_RULES/evidenceMedia, not spectator mediaPolicy.
const maximumByKind = new Map<string, number>([
  ['screenshots', 20 * 1024 ** 2], ['voice-memos', 50 * 1024 ** 2],
  ['videos', 2 * 1024 ** 3], ['game-logs', 100 * 1024 ** 2],
]);

export const mediaOperationPolicy: ServiceOperationPolicy = c => {
  const match = /^\/api\/x\/volputas\/evidence\/media\/(screenshots|voice-memos|videos|game-logs)\/([^/]+)(\/ticket)?$/.exec(c.req.path);
  if (!match) return null;
  const maximumBytes = maximumByKind.get(match[1] ?? '');
  if (maximumBytes === undefined) return null;
  const acl = (_context: Context, identity: AuthIdentity): boolean => approved(identity);
  if (c.req.method === 'GET') return classify(match[3] ? 'evidence.media.ticket' : 'evidence.media.read', 'sensitive_read', acl);
  if (c.req.method !== 'PUT' || match[3]) return null;
  return { ...classify('evidence.media.write', 'important', acl, maximumBytes), upload: { maximumBytes, timeoutSeconds: 300 } };
};
