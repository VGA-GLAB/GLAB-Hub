import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'node:test';
import { verifyAttestation } from '../plugins/attendance/attestation-verify.ts';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const NOW = 1_800_000_000_000;

function makeAttestation(overrides: Record<string, unknown> = {}, signer = privateKey): string {
  const payload = {
    sub: 'user-1', placeId: 'fac-1', lanId: 'lan-1', nonce: 'nonce-1', issuedAt: NOW, ...overrides,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(null, Buffer.from(body), signer).toString('base64url');
  return `${body}.${signature}`;
}

const findGateway = (lanId: string) => lanId === 'lan-1'
  ? { lanId, facilityId: 'fac-1', publicKeyPem }
  : null;
const opts = { findGateway, now: () => NOW, freshnessMs: 120_000 };

test('a valid attestation verifies and returns its payload', () => {
  const result = verifyAttestation(makeAttestation(), opts);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.payload.sub, 'user-1');
});

test('an unknown gateway is rejected', () => {
  const result = verifyAttestation(makeAttestation({ lanId: 'lan-x' }), opts);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, 'unknown_gateway');
});

test('a signature from another key and a tampered payload are rejected', () => {
  const other = generateKeyPairSync('ed25519').privateKey;
  assert.equal(verifyAttestation(makeAttestation({}, other), opts).ok, false);
  const [, signature] = makeAttestation().split('.');
  const forged = Buffer.from(JSON.stringify({
    sub: 'attacker', placeId: 'fac-1', lanId: 'lan-1', nonce: 'nonce-1', issuedAt: NOW,
  })).toString('base64url');
  assert.equal(verifyAttestation(`${forged}.${signature}`, opts).ok, false);
});

test('attestations outside the absolute 120-second freshness window are rejected', () => {
  for (const issuedAt of [NOW - 300_000, NOW + 300_000]) {
    const result = verifyAttestation(makeAttestation({ issuedAt }), opts);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, 'attestation_stale');
  }
});

test('malformed attestations are rejected without throwing', () => {
  for (const value of ['', 'not-an-attestation', 'a.b.c', 'Zm9v.']) {
    const result = verifyAttestation(value, opts);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, 'attestation_malformed');
  }
});
