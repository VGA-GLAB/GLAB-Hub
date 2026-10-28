// @implements SPEC-GLAB-COCOIRU-DISTRIBUTION-001
import { constants, createCipheriv, createPublicKey, publicEncrypt, randomBytes, type KeyObject } from 'node:crypto';
export function recipientKey(pem: string): KeyObject {
  if (pem.length > 4096 || !pem.startsWith('-----BEGIN PUBLIC KEY-----')) throw new Error('Invalid recipient');
  const key = createPublicKey(pem);
  const bits = key.asymmetricKeyDetails?.modulusLength ?? 0;
  if (key.asymmetricKeyType !== 'rsa' || bits !== 3072) throw new Error('RSA-3072 recipient required');
  return key;
}
export function encryptRelease(raw: Buffer, key: KeyObject, nonce: string): Record<string, string> {
  const secret = randomBytes(32), iv = randomBytes(12);
  try {
    const aad = Buffer.from(`glab-delivery-v1:${nonce}`, 'utf8');
    const cipher = createCipheriv('aes-256-gcm', secret, iv, { authTagLength: 16 });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(raw), cipher.final()]);
    return { format: 'glab-delivery-v1', nonce, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'),
      wrappedKey: publicEncrypt({ key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256', oaepLabel: aad }, secret).toString('base64'),
      ciphertext: ciphertext.toString('base64') };
  } finally { secret.fill(0); }
}
