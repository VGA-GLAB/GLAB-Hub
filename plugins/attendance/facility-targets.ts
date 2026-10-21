import { createHmac, createPublicKey, randomUUID } from 'node:crypto';

export interface FacilityGateway {
  organizationId: string;
  facilityId: string;
  name: string;
  lanId: string;
  url: string;
  publicKeyPem: string;
  challengeSecret: string;
  /** Optional additional restriction; an empty list denies everyone. */
  allowedUserIds?: string[];
}

/** Trusted deployment configuration; never accept gateway addresses/keys from a browser. */
export function parseFacilityGateways(raw: string | undefined): FacilityGateway[] {
  if (!raw) return [];
  let rows: unknown;
  try { rows = JSON.parse(raw); } catch { throw new Error('Invalid facility gateway JSON'); }
  if (!Array.isArray(rows) || rows.length > 100) throw new Error('Invalid facility gateway configuration');
  const ids = new Set<string>();
  return rows.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw new Error('Invalid facility gateway');
    const item = row as Record<string, unknown>;
    for (const key of ['organizationId', 'facilityId', 'name', 'lanId', 'url', 'publicKeyPem', 'challengeSecret']) {
      if (typeof item[key] !== 'string' || !(item[key] as string).trim()) throw new Error('Incomplete facility gateway');
    }
    const gateway = item as unknown as FacilityGateway;
    if ('allowedUserIds' in item && (!Array.isArray(item.allowedUserIds)
      || item.allowedUserIds.length > 1000
      || item.allowedUserIds.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim() || id.length > 512))) {
      throw new Error('Invalid facility user restriction');
    }
    const url = new URL(gateway.url);
    if (url.protocol !== 'https:' || url.origin !== gateway.url || url.username || url.password
      || gateway.challengeSecret.length < 32 || ids.has(gateway.lanId)
      || createPublicKey(gateway.publicKeyPem).asymmetricKeyType !== 'ed25519') {
      throw new Error('Invalid facility gateway configuration');
    }
    ids.add(gateway.lanId);
    return gateway;
  });
}

export function relatedGateways(gateways: readonly FacilityGateway[], organizationIds: readonly string[], userId: string): FacilityGateway[] {
  const allowed = new Set(organizationIds);
  return gateways.filter(gateway => allowed.has(gateway.organizationId)
    && (gateway.allowedUserIds === undefined || gateway.allowedUserIds.includes(userId)));
}

/** A single-use, attendance-only capability. No reusable Cernere token leaves GLab. */
export function facilityChallenge(gateway: FacilityGateway, userId: string, now: number): string {
  const payload = Buffer.from(JSON.stringify({
    purpose: 'glab-facility-attendance', sub: userId, facilityId: gateway.facilityId,
    lanId: gateway.lanId, nonce: randomUUID(), issuedAt: now, expiresAt: now + 60_000,
  })).toString('base64url');
  return `${payload}.${createHmac('sha256', gateway.challengeSecret).update(payload).digest('base64url')}`;
}
