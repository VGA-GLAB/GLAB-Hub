// テスト用の Cernere service token 発行器 (PASETO v4.public / Ed25519)。
// Cernere は paseto ライブラリで footer {"kid"} 付きに署名する。 同じ形をここで再現する。

import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';

export interface TestSigner {
  kid: string;
  privateKey: KeyObject;
  /** raw 32 byte 公開鍵 (well-known の public_key に載る値)。 */
  publicKeyRaw: Buffer;
}

export function makeSigner(kid = 'v1'): TestSigner {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  return { kid, privateKey, publicKeyRaw: Buffer.from(spki.subarray(spki.length - 32)) };
}

function le64(n: number): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(n));
  return out;
}

export function signPaseto(signer: TestSigner, claims: Record<string, unknown>, footerKid: string | null = signer.kid): string {
  const message = Buffer.from(JSON.stringify(claims));
  const footer = footerKid ? Buffer.from(JSON.stringify({ kid: footerKid })) : Buffer.alloc(0);
  const pieces = [Buffer.from('v4.public.'), message, footer, Buffer.alloc(0)];
  const pae = Buffer.concat([le64(pieces.length), ...pieces.flatMap((p) => [le64(p.length), p])]);
  const signature = sign(null, pae, signer.privateKey);
  const body = Buffer.concat([message, signature]).toString('base64url');
  return footer.length ? `v4.public.${body}.${footer.toString('base64url')}` : `v4.public.${body}`;
}

export function serviceClaims(overrides: Record<string, unknown> = {}, nowMs = Date.now()): Record<string, unknown> {
  return {
    kind: 'service',
    sub: 'some-caller',
    aud: 'educationlab',
    scope: ['glab-external:write'],
    iat: new Date(nowMs).toISOString(),
    exp: new Date(nowMs + 15 * 60_000).toISOString(),
    jti: 'jti-1',
    ...overrides,
  };
}

/** `/.well-known/cernere-public-key` の応答。 */
export function publicKeyResponse(...signers: TestSigner[]): Response {
  return Response.json({
    keys: signers.map((s, i) => ({ kid: s.kid, alg: 'EdDSA', public_key: s.publicKeyRaw.toString('base64'), current: i === 0 })),
  });
}
