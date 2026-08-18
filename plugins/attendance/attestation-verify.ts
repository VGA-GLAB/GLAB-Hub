import { createPublicKey, verify } from 'node:crypto';

export interface AttestationPayload {
  sub: string;
  placeId: string;
  lanId: string;
  nonce: string;
  issuedAt: number;
}

interface GatewayPublicKey {
  lanId: string;
  facilityId: string;
  publicKeyPem: string;
}

type AttestationVerification =
  | { ok: true; payload: AttestationPayload; gateway: GatewayPublicKey }
  | { ok: false; reason: 'attestation_malformed' | 'unknown_gateway' | 'attestation_invalid' | 'attestation_stale' };

interface VerifyAttestationOptions {
  findGateway(lanId: string): GatewayPublicKey | null;
  now(): number;
  freshnessMs: number;
}

/** Ostiarius が署名した base64url(payload).base64url(signature) を検証する。 */
export function verifyAttestation(raw: string, options: VerifyAttestationOptions): AttestationVerification {
  const parts = raw.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1] || !isBase64Url(parts[0]) || !isBase64Url(parts[1])) {
    return { ok: false, reason: 'attestation_malformed' };
  }

  let payload: AttestationPayload;
  try {
    payload = parsePayload(Buffer.from(parts[0], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'attestation_malformed' };
  }

  const gateway = options.findGateway(payload.lanId);
  if (!gateway) return { ok: false, reason: 'unknown_gateway' };

  try {
    const publicKey = createPublicKey(gateway.publicKeyPem);
    if (publicKey.asymmetricKeyType !== 'ed25519' || !verify(null, Buffer.from(parts[0]), publicKey, Buffer.from(parts[1], 'base64url'))) {
      return { ok: false, reason: 'attestation_invalid' };
    }
  } catch {
    return { ok: false, reason: 'attestation_invalid' };
  }

  if (Math.abs(options.now() - payload.issuedAt) > options.freshnessMs) {
    return { ok: false, reason: 'attestation_stale' };
  }
  return { ok: true, payload, gateway };
}

function isBase64Url(value: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(value);
}

function parsePayload(json: string): AttestationPayload {
  const value = JSON.parse(json) as Record<string, unknown>;
  if (
    typeof value.sub !== 'string' || !value.sub ||
    typeof value.placeId !== 'string' || !value.placeId ||
    typeof value.lanId !== 'string' || !value.lanId ||
    typeof value.nonce !== 'string' || !value.nonce ||
    typeof value.issuedAt !== 'number' || !Number.isFinite(value.issuedAt)
  ) throw new Error('invalid attestation payload');
  return {
    sub: value.sub,
    placeId: value.placeId,
    lanId: value.lanId,
    nonce: value.nonce,
    issuedAt: value.issuedAt,
  };
}
