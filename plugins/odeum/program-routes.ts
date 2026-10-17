import { Hono, getIdentity, getDisplayName } from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { getProjectWithMembers } from '../data.ts';
import { getEventStore } from '../events/store.ts';
import { canSee, parseAudience, resolveRoles } from '../roles/audience.ts';
import { noStore } from '../shared.ts';
import type { OdeumConfig } from './config.ts';
import { getOdeumSession } from './session-store.ts';
import { canEndPresentation } from './permissions.ts';
import { deriveInvitation, invitationSecret, inviteClaim } from './invitation.ts';
import { signOdeumTicket } from './ticket.ts';

const requestSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('producer'), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/) }).strict(),
  z.object({ role: z.literal('presenter'), slot: z.enum(['input1', 'input2', 'input3', 'input4']) }).strict(),
]);

/** GLab owns project membership; a native launch URL only carries the selected context. */
export function makeProgramRoutes(ctx: CorpusContext, config: OdeumConfig): Hono {
  const routes = new Hono();
  routes.post('/sessions/:id/program-ticket', async (c) => {
    noStore(c);
    if (config.disabledReason || !config.signer || !config.relay) return c.json({ error: 'odeum_disabled' }, 503);
    const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_program_request' }, 400);
    const actor = getIdentity(c);
    const session = getOdeumSession(ctx.db, c.req.param('id'));
    if (!session || session.status !== 'live') return c.json({ error: 'session_not_live' }, 404);
    const event = await getEventStore().get(session.eventId);
    if (!event || !canSee(parseAudience(event.audience_roles), resolveRoles(ctx.db, actor.userId), event.created_by === actor.userId, actor.isAdmin))
      return c.json({ error: 'session_not_live' }, 404);
    const operator = canEndPresentation(session, event, actor);
    const current = ctx.db.prepare('SELECT project_id AS projectId FROM glab_odeum_programs WHERE session_id = ?')
      .get(session.id) as { projectId: string } | undefined;
    const projectId = parsed.data.role === 'producer' ? parsed.data.projectId : current?.projectId;
    if (!projectId) return c.json({ error: 'program_not_configured' }, 409);
    const project = getProjectWithMembers(ctx.db, projectId);
    if (!project) return c.json({ error: 'project_not_found' }, 404);
    if (parsed.data.role === 'producer' && !operator) return c.json({ error: 'forbidden' }, 403);
    if (!operator && !project.members.some((member) => member.user_id === actor.userId)) return c.json({ error: 'forbidden' }, 403);
    if (parsed.data.role === 'producer') {
      // Insert-once binding prevents parallel operators from moving an active program to another project.
      ctx.db.prepare('INSERT OR IGNORE INTO glab_odeum_programs (session_id, project_id) VALUES (?, ?)').run(session.id, projectId);
      const bound = ctx.db.prepare('SELECT project_id AS projectId FROM glab_odeum_programs WHERE session_id = ?')
        .get(session.id) as { projectId: string };
      if (bound.projectId !== projectId) return c.json({ error: 'program_project_conflict' }, 409);
    }
    const invitation = deriveInvitation(invitationSecret(config.signer.privateKey), session.id);
    const ticket = signOdeumTicket(config.signer, {
      sub: actor.userId, name: getDisplayName(ctx.db, actor.userId) || actor.userId,
      sid: session.id, role: parsed.data.role,
      ...(parsed.data.role === 'presenter' ? { slot: parsed.data.slot } : {}),
      invite: inviteClaim(invitation),
    });
    const action = parsed.data.role === 'producer' ? 'produce' : 'present';
    const query = new URLSearchParams({ relay: config.relay.wsBase, ticket: ticket.token, projectId });
    return c.json({ launchUrl: `odeum://${action}?${query}`, expiresAt: ticket.claims.exp * 1000, projectId });
  });
  return routes;
}
