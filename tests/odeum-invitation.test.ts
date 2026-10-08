import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { invitationBases, relayEndpoints, resolveOdeumConfig } from '../plugins/odeum/config.ts';
import {
  deriveInvitation,
  formatGuestCode,
  guestJoinUrl,
  invitationSecret,
  inviteClaim,
  overlayUrl,
  sha256Base64Url,
} from '../plugins/odeum/invitation.ts';
import { loadTicketSigner, signOdeumTicket } from '../plugins/odeum/ticket.ts';

const newSigner = () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  return loadTicketSigner(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'kid');
};
const decode = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;

test('invitations are stable per session and never reuse the signing key directly', () => {
  const signer = newSigner();
  const secret = invitationSecret(signer.privateKey);
  const first = deriveInvitation(secret, 'session-1');
  assert.deepEqual(deriveInvitation(secret, 'session-1'), first, 'reconnects reuse the same values');
  assert.notEqual(deriveInvitation(secret, 'session-2').guestCode, first.guestCode);
  assert.notEqual(deriveInvitation(invitationSecret(newSigner().privateKey), 'session-1').overlayKey, first.overlayKey);
  // relay の正規化表 (Crockford, 10 文字) と canonical な 32 byte base64url。
  assert.match(first.guestCode, /^[0-9A-HJKMNP-TV-Z]{10}$/);
  assert.match(first.overlayKey, /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
});

test('invite claim digests match the relay (base64url SHA-256 of the plain values)', () => {
  // Odeum native/tests/guest_tests.cpp と同じ既知ベクトル。
  assert.equal(sha256Base64Url('abc'), 'ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  const claim = inviteClaim({ guestCode: 'ABCDEFGH12', overlayKey: 'k' });
  assert.deepEqual(claim, { join: sha256Base64Url('ABCDEFGH12'), overlay: sha256Base64Url('k') });
  assert.equal(claim.join.length, 43);
});

test('codes and keys travel in URL fragments only', () => {
  assert.equal(formatGuestCode('ABCDEFGH12'), 'ABCDE-FGH12');
  assert.equal(guestJoinUrl('http://192.168.1.5:4400/', 'ABCDEFGH12'), 'http://192.168.1.5:4400/join#code=ABCDEFGH12');
  assert.equal(overlayUrl('http://127.0.0.1:4400/', 'a-b_c'), 'http://127.0.0.1:4400/overlay#key=a-b_c');
});

test('only presenter tickets carry the invite claim', () => {
  const signer = newSigner();
  const invite = inviteClaim(deriveInvitation(invitationSecret(signer.privateKey), 's'));
  const issued = signOdeumTicket(signer, { sub: 'u', name: 'n', role: 'presenter', sid: 's', invite });
  assert.deepEqual(decode(issued.token.split('.')[1]!).invite, invite);
  assert.throws(() => signOdeumTicket(signer, { sub: 'u', name: 'n', role: 'viewer', sid: 's', invite }));
  assert.throws(() => signOdeumTicket(signer, {
    sub: 'u', name: 'n', role: 'presenter', sid: 's', invite: { join: invite.join, overlay: invite.join },
  }));
  const plain = signOdeumTicket(signer, { sub: 'u', name: 'n', role: 'presenter', sid: 's' });
  assert.equal('invite' in decode(plain.token.split('.')[1]!), false);
});

test('invitation bases default to the relay and accept only http(s) overrides', () => {
  const relay = relayEndpoints('http://relay.local:4400');
  const env = (values: Record<string, string>) => (key: string) => values[key];
  assert.deepEqual(invitationBases(env({}), relay), { guest: 'http://relay.local:4400/', overlay: 'http://relay.local:4400/' });
  assert.deepEqual(
    invitationBases(env({ ODEUM_GUEST_BASE_URL: 'http://192.168.1.5:4400', ODEUM_OVERLAY_BASE_URL: 'http://127.0.0.1:4400/' }), relay),
    { guest: 'http://192.168.1.5:4400/', overlay: 'http://127.0.0.1:4400/' },
  );
  assert.equal(invitationBases(env({ ODEUM_GUEST_BASE_URL: 'ws://192.168.1.5:4400' }), relay), null);
  assert.equal(invitationBases(env({ ODEUM_GUEST_BASE_URL: 'http://x/?code=1' }), relay), null);
  assert.equal(invitationBases(env({}), null), null);
  assert.equal(resolveOdeumConfig(env({})).invitationBases, null);
});
