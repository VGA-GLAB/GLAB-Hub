import { getIdentity, type CorpusContext, type Hono } from '../../corpus/server/hub/sdk.ts';
import { bookingGroups } from '../facility/booking-proxy.ts';
import { dateInJst, recordAttendance, reserveAttendanceNonce } from '../data.ts';
import { facilityChallenge, parseFacilityGateways, relatedGateways } from './facility-targets.ts';
import { verifyAttestation } from './attestation-verify.ts';

export function registerAutomaticAttendance(router: Hono, ctx: CorpusContext): void {
  const gateways = parseFacilityGateways(ctx.env('GLAB_ATTENDANCE_GATEWAYS'));
  router.post('/automatic/targets', async c => {
    c.header('cache-control', 'private, no-store');
    if (!gateways.length) return c.json({ configured: false, targets: [] });
    try {
      const organizations = gateways.some(gateway => gateway.organizationId !== undefined)
        ? (await bookingGroups(c, ctx)).filter(group => group.kind === 'organization').map(group => group.id) : [];
      const targets = relatedGateways(gateways, organizations, getIdentity(c).userId).map(gateway => ({
        facilityId: gateway.facilityId, lanId: gateway.lanId, name: gateway.name, url: gateway.url,
        challenge: facilityChallenge(gateway, getIdentity(c).userId, Date.now()),
      }));
      return c.json({ configured: true, targets });
    } catch {
      return c.json({ error: 'facility_memberships_unavailable' }, 503);
    }
  });
  router.post('/automatic/checkin', async c => {
    c.header('cache-control', 'private, no-store');
    const body = await c.req.json().catch(() => null) as { attestation?: unknown } | null;
    if (typeof body?.attestation !== 'string' || body.attestation.length > 16_384) return c.json({ error: 'attestation_required' }, 400);
    const verified = verifyAttestation(body.attestation, {
      now: Date.now, freshnessMs: 15_000,
      findGateway: lanId => gateways.find(gateway => gateway.lanId === lanId) ?? null,
    });
    if (!verified.ok) return c.json({ error: verified.reason }, 400);
    if (verified.payload.method !== 'session' || verified.payload.assurance !== 'low') return c.json({ error: 'automatic_proof_required' }, 400);
    const identity = getIdentity(c);
    if (verified.payload.sub !== identity.userId) return c.json({ error: 'subject_mismatch' }, 403);
    let organizations: string[];
    try { organizations = gateways.find(gateway => gateway.lanId === verified.payload.lanId)?.organizationId !== undefined
      ? (await bookingGroups(c, ctx)).filter(group => group.kind === 'organization').map(group => group.id) : []; }
    catch { return c.json({ error: 'facility_memberships_unavailable' }, 503); }
    if (!relatedGateways(gateways, organizations, identity.userId).some(gateway => gateway.lanId === verified.payload.lanId)) {
      return c.json({ error: 'facility_not_in_organization' }, 403);
    }
    if (!reserveAttendanceNonce(ctx.db, verified.payload.nonce)) return c.json({ error: 'replay_detected' }, 409);
    const created = recordAttendance(ctx.db, {
      userId: identity.userId, date: dateInJst(verified.payload.issuedAt), facilityId: verified.payload.placeId,
      checkedInAt: verified.payload.issuedAt, source: 'session', assurance: 'low',
      eventId: null, detail: { lanId: verified.payload.lanId, automatic: true },
    });
    return c.json({ ok: true, alreadyCheckedIn: !created });
  });
}
