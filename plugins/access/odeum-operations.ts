/** Exact presentation operations; existing Odeum tickets/relay remain separate contracts.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
import type { ServiceOperationPolicy } from '../../corpus/server/hub/sdk.ts';
import { getProjectWithMembers } from '../data.ts';
import { OdeumAuthorization, type PresentationEventReader } from '../odeum/authorization.ts';
import { startSchema } from '../odeum/start-request.ts';
import { programRequestSchema } from '../odeum/program-request.ts';
import { getEventStore } from '../events/store.ts';
import { currentAdmissionDatabase } from './policy.ts';
import { classify } from './operation-classification.ts';

export function odeumOperationPolicy(events: () => PresentationEventReader = getEventStore): ServiceOperationPolicy {
  return c => {
    const path = c.req.path, method = c.req.method;
    const authorization = () => new OdeumAuthorization(currentAdmissionDatabase(), events);
    if (method === 'GET' && path === '/api/x/odeum/status') return classify('odeum.status.read', 'read', (_ctx, identity) => authorization().member(identity));
    if (method === 'GET' && path === '/api/x/odeum/live') return classify('odeum.live.read', 'sensitive_read', (_ctx, identity) => authorization().member(identity));
    if (method === 'GET' && path === '/api/x/odeum/ticket-pubkeys') return classify('odeum.ticket-keys.read', 'sensitive_read', (_ctx, identity) => authorization().member(identity) && identity.isAdmin);
    if (method === 'POST' && path === '/api/x/odeum/sessions') {
      return classify('odeum.session.start', 'important', async (context, identity) => {
        const access = authorization();
        if (!access.member(identity)) return false;
        const parsed = startSchema.safeParse(await context.req.raw.clone().json().catch(() => null));
        if (!parsed.success || !access.member(identity)) return false;
        return 'eventId' in parsed.data ? access.start(parsed.data.eventId, identity) : true;
      }, 8192);
    }
    const match = /^\/api\/x\/odeum\/sessions\/([A-Za-z0-9_-]{1,128})\/(end|viewer-ticket|invitation|program-ticket)$/.exec(path);
    if (!match) return null;
    const id = match[1] ?? '', kind = match[2];
    if (method !== (kind === 'invitation' ? 'GET' : 'POST')) return null;
    const action = kind === 'end' ? 'odeum.session.end' : kind === 'viewer-ticket' ? 'odeum.viewer-ticket.issue'
      : kind === 'invitation' ? 'odeum.invitation.read' : 'odeum.program-ticket.issue';
    return classify(action, kind === 'invitation' ? 'sensitive_read' : 'important', async (context, identity) => {
      const access = await authorization().session(id, identity);
      if (!access) return false;
      // Stopping one's own presentation remains possible after its event disappears.
      if (kind === 'end') return access.operator;
      if (access.session.status !== 'live') return false;
      if (kind === 'viewer-ticket') return access.visible;
      if (kind === 'invitation') return access.event !== null && access.operator;
      const parsed = programRequestSchema.safeParse(await context.req.raw.clone().json().catch(() => null));
      if (!parsed.success) return false;
      // Body parsing may yield as well: obtain current session/event/roles again.
      const current = await authorization().session(id, identity);
      if (!current || current.session.status !== 'live' || !current.event || !current.visible) return false;
      const db = currentAdmissionDatabase();
      const bound = db.prepare('SELECT project_id AS projectId FROM glab_odeum_programs WHERE session_id = ?').get(id) as { projectId: string } | undefined;
      const projectId = parsed.data.role === 'producer' ? parsed.data.projectId : bound?.projectId;
      if (!projectId || (bound && bound.projectId !== projectId)) return false;
      const project = getProjectWithMembers(db, projectId);
      return Boolean(project && (parsed.data.role !== 'producer' || current.operator)
        && (current.operator || project.members.some(member => member.user_id === identity.userId)));
    }, 8192);
  };
}
