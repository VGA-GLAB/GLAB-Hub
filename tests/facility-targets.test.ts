import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createHmac, generateKeyPairSync, randomBytes } from 'node:crypto';
import { parseFacilityGateways, relatedGateways, facilityChallenge } from '../plugins/attendance/facility-targets.ts';

const key = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
const config = { organizationId: 'org-a', facilityId: 'f', name: 'Venue', lanId: 'lan', url: 'https://lan.example',
  publicKeyPem: key, challengeSecret: randomBytes(32).toString('base64url') };
it('selects only gateways belonging to authenticated organizations', () => {
  const gateways = parseFacilityGateways(JSON.stringify([config]));
  assert.equal(relatedGateways(gateways, ['org-b']).length, 0);
  assert.equal(relatedGateways(gateways, ['org-a']).length, 1);
  assert.throws(() => parseFacilityGateways(JSON.stringify([{ ...config, url: 'http://lan.example' }])));
  assert.throws(() => parseFacilityGateways(JSON.stringify([config, config])));
});
it('issues unique short-lived user and facility-bound capabilities without exposing secrets', () => {
  const gateway = parseFacilityGateways(JSON.stringify([config]))[0];
  const token = facilityChallenge(gateway, 'user', 1234);
  const [payload, signature] = token.split('.');
  assert.equal(signature, createHmac('sha256', config.challengeSecret).update(payload).digest('base64url'));
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  assert.equal(claims.sub, 'user'); assert.equal(claims.facilityId, 'f');
  assert.equal(claims.expiresAt - claims.issuedAt, 60000);
  assert.notEqual(token, facilityChallenge(gateway, 'user', 1234));
});
