import { verify } from 'node:crypto';
import { ed25519PublicKey, type PasetoVerifyKey } from '../plugins/projects/paseto-v4-public.ts';

const HEADER = 'v4.public.';

function le64(n: number): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(n));
  return out;
}

/** 実装とは独立に PAE を組み直して、 いずれかの鍵で署名が通るかを見る。 */
function signedByAnyKey(token: string, keys: readonly PasetoVerifyKey[]): Record<string, unknown> | null {
  if (!token.startsWith(HEADER)) return null;
  const [body, footer = ''] = token.slice(HEADER.length).split('.');
  const raw = Buffer.from(body ?? '', 'base64url');
  if (raw.length <= 64) return null;
  const message = raw.subarray(0, raw.length - 64);
  const signature = raw.subarray(raw.length - 64);
  const f = Buffer.from(footer, 'base64url');
  const pieces = [Buffer.from(HEADER), message, f, Buffer.alloc(0)];
  const pae = Buffer.concat([le64(pieces.length), ...pieces.flatMap((p) => [le64(p.length), p])]);
  const ok = keys.some((key) => key.publicKey.length === 32 && verify(null, pae, ed25519PublicKey(key.publicKey), signature));
  return ok ? JSON.parse(message.toString('utf8')) as Record<string, unknown> : null;
}

export default {
  /** C-14: claims を返すのは署名が検証できたときだけで、 その中身は署名済み message と一致する。 */
  post: (result: Record<string, unknown> | null, token: string, keys: readonly PasetoVerifyKey[]): boolean => {
    if (result === null) return true;
    const expected = signedByAnyKey(token, keys);
    return expected !== null && JSON.stringify(expected) === JSON.stringify(result);
  },
};
