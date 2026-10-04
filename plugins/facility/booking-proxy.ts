import { getIdentity, getUserToken, type Context, type CorpusContext, type ServiceConnector } from '../../corpus/server/hub/sdk.ts';
import { authorizedConnectorFetch, PRIVATE_NO_STORE } from '../shared.ts';
import { readOrganizations, readTeams, type BookingGroup } from './groups.ts';
import { signBookingContext } from './context-signature.ts';

export async function bookingGroups(c: Context, ctx: CorpusContext): Promise<BookingGroup[]> {
  const token = getUserToken(c), base = ctx.env('CERNERE_BASE_URL');
  if (!token || !base) throw new Error('Authenticated Cernere connection required');
  const userId = getIdentity(c).userId;
  const organizations = await readOrganizations(base, token, userId);
  return [...organizations, ...readTeams(ctx.db, userId)];
}

/** Do not forward caller-supplied assertions, owner IDs, cookies or upstream errors. */
export async function bookingProxy(
  c: Context, ctx: CorpusContext, connector: ServiceConnector, pathname: string,
  readGroups: typeof bookingGroups = bookingGroups,
): Promise<Response> {
  const noStore = { 'cache-control': PRIVATE_NO_STORE };
  if (!getUserToken(c)) return Response.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  try {
    const secret = ctx.env('GLAB_AEDILIS_CONTEXT_SECRET');
    if (!secret) throw new Error('Booking context secret not configured');
    // An older Aedilis ignores unknown fields. Refuse writes until its access-control contract is present.
    const capabilities = await authorizedConnectorFetch(c, connector, '/api/reservations/capabilities', ctx.tokenProvider);
    if (!capabilities.ok || (await capabilities.json() as { groupContextVersion?: number }).groupContextVersion !== 1) {
      return Response.json({ error: 'booking_service_update_required' }, { status: 503, headers: noStore });
    }
    const groups = await readGroups(c, ctx);
    const method = c.req.method;
    const body = ['GET', 'HEAD'].includes(method) ? '' : await c.req.text();
    const path = pathname + new URL(c.req.url).search;
    const assertion = signBookingContext(secret, getIdentity(c).userId, groups, method, path, body);
    const response = await authorizedConnectorFetch(c, connector, path, ctx.tokenProvider, connector.id, {
      method, headers: { 'content-type': 'application/json', 'x-glab-booking-context': assertion },
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
