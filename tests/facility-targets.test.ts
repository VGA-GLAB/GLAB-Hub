import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createHmac, generateKeyPairSync, randomBytes } from 'node:crypto';
import { parseFacilityGateways, relatedGateways, facilityChallenge } from '../plugins/attendance/facility-targets.ts';

const key = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
const config = { organizationId: 'org-a', facilityId: 'f', name: 'Venue', lanId: 'lan', url: 'https://lan.example',
  publicKeyPem: key, challengeSecret: randomBytes(32).toString('base64url') };
it('selects only gateways belonging to authenticated organizations', () => {
  const gateways = parseFacilityGateways(JSON.stringify([config]));
  assert.equal(relatedGateways(gateways, ['org-b'], 'user').length, 0);
  assert.equal(relatedGateways(gateways, ['org-a'], 'user').length, 1);
  assert.throws(() => parseFacilityGateways(JSON.stringify([{ ...config, url: 'http://lan.example' }])));
  assert.throws(() => parseFacilityGateways(JSON.stringify([config, config])));
});
it('requires both organization membership and an explicitly allowed user for private facilities', () => {
  const gateways = parseFacilityGateways(JSON.stringify([{ ...config, allowedUserIds: ['owner'] }]));
  assert.equal(relatedGateways(gateways, ['org-a'], 'owner').length, 1);
  assert.equal(relatedGateways(gateways, ['org-a'], 'another-member').length, 0);
  assert.equal(relatedGateways(gateways, ['org-b'], 'owner').length, 0);
  const closed = parseFacilityGateways(JSON.stringify([{ ...config, allowedUserIds: [] }]));
  assert.equal(relatedGateways(closed, ['org-a'], 'owner').length, 0);
});
it('rejects malformed private facility restrictions instead of broadening access', () => {
  for (const allowedUserIds of [null, 'owner', [null], [1], [''], [' owner ']]) {
    assert.throws(() => parseFacilityGateways(JSON.stringify([{ ...config, allowedUserIds }])));
  }
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
