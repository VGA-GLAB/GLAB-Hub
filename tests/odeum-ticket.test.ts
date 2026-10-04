import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import test from 'node:test';
import { relayEndpoints, resolveOdeumConfig } from '../plugins/odeum/config.ts';
import {
  MAX_TICKET_TTL_SECONDS,
  loadTicketSigner,
  publicKeysDocument,
  signOdeumTicket,
} from '../plugins/odeum/ticket.ts';
import contract from '../contracts/odeum-ticket.contract.ts';

const { privateKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const signer = loadTicketSigner(privatePem, 'glab-2026-10');

function decode(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

test('tickets are EdDSA JWS with kid and the designed claims', () => {
  const now = Date.UTC(2026, 9, 4, 3, 0, 0);
  const subject = { sub: 'user-1', name: '発表 太郎', role: 'presenter' as const, sid: 'session-1' };
  const options = { nowMs: now, ttlSeconds: 300, jti: 'jti-1' };
  const issued = signOdeumTicket(signer, subject, options);
  assert.equal(contract.post(issued, signer, subject, options), true);
  const [header, payload, signature] = issued.token.split('.');
  assert.deepEqual(decode(header!), { alg: 'EdDSA', typ: 'JWT', kid: 'glab-2026-10' });
  assert.deepEqual(decode(payload!), {
    iss: 'glab',
    aud: 'odeum-relay',
    sub: 'user-1',
    name: '発表 太郎',
    role: 'presenter',
    sid: 'session-1',
    exp: Math.floor(now / 1000) + 300,
    jti: 'jti-1',
  });
  const publicPem = publicKeysDocument(signer)['glab-2026-10'];
  assert.ok(publicPem?.includes('BEGIN PUBLIC KEY'));
  assert.equal(
    verify(null, Buffer.from(`${header}.${payload}`), publicPem!, Buffer.from(signature!, 'base64url')),
    true,
  );
});

test('a tampered payload no longer verifies against the published key', () => {
  const issued = signOdeumTicket(signer, { sub: 'user-1', name: 'a', role: 'viewer', sid: 's' });
  const [header, , signature] = issued.token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...issued.claims, role: 'presenter' })).toString('base64url');
  const publicPem = publicKeysDocument(signer)['glab-2026-10']!;
  assert.equal(
    verify(null, Buffer.from(`${header}.${forged}`), publicPem, Buffer.from(signature!, 'base64url')),
    false,
  );
});

test('expiry never exceeds five minutes and jti is unique per ticket', () => {
  const now = 1_800_000_000_000;
  const subject = { sub: 'u', name: 'n', role: 'viewer' as const, sid: 's' };
  const long = signOdeumTicket(signer, subject, { nowMs: now, ttlSeconds: 3_600 });
  assert.equal(long.claims.exp - Math.floor(now / 1000), MAX_TICKET_TTL_SECONDS);
  assert.equal(contract.post(long, signer, subject, { nowMs: now, ttlSeconds: 3_600 }), true);
  const other = signOdeumTicket(signer, subject, { nowMs: now });
  assert.notEqual(long.claims.jti, other.claims.jti);
});

test('service tickets omit sid, while presenter and viewer tickets require it', () => {
  const service = signOdeumTicket(signer, { sub: 'glab-hub', name: 'GLab-Hub', role: 'service' });
  assert.equal('sid' in service.claims, false);
  assert.throws(() => signOdeumTicket(signer, { sub: 'glab-hub', name: 'x', role: 'service', sid: 's' }));
  assert.throws(() => signOdeumTicket(signer, { sub: 'u', name: 'x', role: 'viewer' }));
});

test('display names are truncated to 64 characters', () => {
  const issued = signOdeumTicket(signer, { sub: 'u', name: 'あ'.repeat(80), role: 'viewer', sid: 's' });
  assert.equal(Array.from(issued.claims.name).length, 64);
});

test('only Ed25519 keys are accepted, and escaped newlines from env are understood', () => {
  const { privateKey: rsa } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => loadTicketSigner(rsa.export({ type: 'pkcs8', format: 'pem' }).toString(), 'k'));
  assert.equal(loadTicketSigner(privatePem.replace(/\n/g, '\\n'), 'k').kid, 'k');
});

test('missing or invalid key disables odeum without throwing', () => {
  const env = (values: Record<string, string>) => (key: string) => values[key];
  const relay = { ODEUM_RELAY_URL: 'http://127.0.0.1:4400' };
  const key = { GLAB_ODEUM_TICKET_PRIVATE_KEY: privatePem, GLAB_ODEUM_TICKET_KID: 'k' };
  assert.equal(resolveOdeumConfig(env(relay)).disabledReason, 'ticket_key_missing');
  assert.equal(
    resolveOdeumConfig(env({ ...relay, GLAB_ODEUM_TICKET_PRIVATE_KEY: 'nope', GLAB_ODEUM_TICKET_KID: 'k' })).disabledReason,
    'ticket_key_invalid',
  );
  assert.equal(resolveOdeumConfig(env(key)).disabledReason, 'relay_url_missing');
  assert.equal(resolveOdeumConfig(env({ ODEUM_RELAY_URL: 'ftp://x' })).disabledReason, 'relay_url_invalid');
  const ready = resolveOdeumConfig(env({ ...relay, ...key }));
  assert.equal(ready.disabledReason, null);
  assert.equal(ready.signer?.kid, 'k');
});

test('the relay URL from topology yields matching HTTP and WebSocket bases', () => {
  assert.deepEqual(relayEndpoints('http://127.0.0.1:4400'), {
    httpBase: 'http://127.0.0.1:4400/', wsBase: 'ws://127.0.0.1:4400/',
  });
  assert.deepEqual(relayEndpoints('wss://odeum.example.test/relay/'), {
    httpBase: 'https://odeum.example.test/relay/', wsBase: 'wss://odeum.example.test/relay/',
  });
  assert.equal(relayEndpoints(' '), null);
  assert.throws(() => relayEndpoints('https://user:pw@odeum.example.test'));
});
