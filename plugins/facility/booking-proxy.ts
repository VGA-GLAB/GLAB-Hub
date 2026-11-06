import { getIdentity, getUserSession, type Context, type CorpusContext, type ServiceConnector } from '../../corpus/server/hub/sdk.ts';
import { authorizedConnectorFetch, PRIVATE_NO_STORE } from '../shared.ts';
import { readOrganizations, readTeams, type BookingGroup } from './groups.ts';
import { signBookingContext } from './context-signature.ts';
import { AEDILIS_GLAB_PREFIX } from '../downstream-operations.ts';
import { approved } from '../access/operation-classification.ts';

async function readGroupsOf(c: Context, ctx: CorpusContext, withRepresentative: boolean): Promise<BookingGroup[]> {
  const session = getUserSession(c), provider = ctx.identityProvider;
  if (!session || !provider) throw new Error('A bound identity provider is required');
  const userId = getIdentity(c).userId;
  const organizations = await readOrganizations(provider, session, { withRepresentative });
  return [...organizations, ...readTeams(ctx.db, userId)];
}

export function bookingGroups(c: Context, ctx: CorpusContext): Promise<BookingGroup[]> {
  return readGroupsOf(c, ctx, false);
}

/** Same as bookingGroups, plus which organizations the caller represents (Meet representative routes only). */
export function bookingGroupsWithRepresentative(c: Context, ctx: CorpusContext): Promise<BookingGroup[]> {
  return readGroupsOf(c, ctx, true);
}

/** Do not forward caller-supplied assertions, owner IDs, cookies or upstream errors. */
export async function bookingProxy(
  c: Context, ctx: CorpusContext, connector: ServiceConnector, pathname: string,
  readGroups: typeof bookingGroups = bookingGroups,
  /** Server-built request (e.g. a redirect URI GLab owns). Replaces the caller's method/body; query is not forwarded. */
  override?: { method: 'GET' | 'POST'; body: string },
): Promise<Response> {
  const noStore = { 'cache-control': PRIVATE_NO_STORE };
  const session = getUserSession(c);
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  try {
    const secret = ctx.env('GLAB_AEDILIS_CONTEXT_SECRET');
    if (!secret) throw new Error('Booking context secret not configured');
    // An older Aedilis ignores unknown fields. Refuse writes until its access-control contract is present.
    const subject = getIdentity(c).userId;
    if (!subject || session.grant.user.id !== subject || !approved(getIdentity(c))) throw new Error('Current admission required');
    const capabilities = await authorizedConnectorFetch(c, connector, AEDILIS_GLAB_PREFIX + '/reservations/capabilities', ctx.tokenProvider, 'aedilis', { method: 'GET', signal: c.req.raw.signal });
    if (!capabilities.ok || (await capabilities.json() as { groupContextVersion?: number }).groupContextVersion !== 1) {
      return Response.json({ error: 'booking_service_update_required' }, { status: 503, headers: noStore });
    }
    const groups = await readGroups(c, ctx);
    const method = override?.method ?? c.req.method;
    const body = override ? override.body : ['GET', 'HEAD'].includes(method) ? '' : await c.req.text();
    const path = override ? pathname : pathname + new URL(c.req.url).search;
    const current = getIdentity(c);
    const currentSession = getUserSession(c);
    if (c.req.raw.signal.aborted || current.userId !== subject || !approved(current) || !currentSession
      || currentSession.token !== session.token || currentSession.grant.user.id !== subject
      || currentSession.grant.sessionBinding !== session.grant.sessionBinding) throw new Error('Current subject/admission required');
    const assertion = signBookingContext(secret, subject, groups, method, path, body);
    const response = await authorizedConnectorFetch(c, connector, path, ctx.tokenProvider, 'aedilis', {
      method, signal: c.req.raw.signal, headers: { 'content-type': 'application/json', 'x-glab-booking-context': assertion },
      ...(['GET', 'HEAD'].includes(method) ? {} : { body }),
    });
    return new Response(await response.text(), {
      status: response.status, headers: { ...noStore, 'content-type': 'application/json' },
    });
  } catch {
    ctx.logger.error('Facility booking request failed');
    return Response.json({ error: 'booking_unavailable' }, { status: 503, headers: noStore });
  }
}
