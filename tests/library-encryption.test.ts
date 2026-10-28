import assert from 'node:assert/strict';
import { it } from 'node:test';
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import { encryptRelease, recipientKey } from '../plugins/software-library/encrypt-release.ts';

it('wraps authenticated content for the intended recipient and rejects changed context', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const nonce = 'b'.repeat(64), aad = Buffer.from(`glab-delivery-v1:${nonce}`);
  const response = encryptRelease(Buffer.from('signed package fixture'), recipientKey(pem), nonce);
  const unwrap = (label: Buffer) => privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256', oaepLabel: label }, Buffer.from(response.wrappedKey, 'base64'));
  assert.throws(() => unwrap(Buffer.from('different request')));
  const key = unwrap(aad);
  try {
    const decrypt = (tag: Buffer) => {
      const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(response.iv, 'base64'), { authTagLength: 16 });
      cipher.setAAD(aad); cipher.setAuthTag(tag);
      return Buffer.concat([cipher.update(Buffer.from(response.ciphertext, 'base64')), cipher.final()]);
    };
    assert.equal(decrypt(Buffer.from(response.tag, 'base64')).toString(), 'signed package fixture');
    assert.throws(() => decrypt(Buffer.alloc(16)));
    const second = encryptRelease(Buffer.from('signed package fixture'), recipientKey(pem), nonce);
    assert.notEqual(second.iv, response.iv);
    assert.notEqual(second.wrappedKey, response.wrappedKey);
    assert.notEqual(second.ciphertext, response.ciphertext);
  } finally { key.fill(0); }
  assert.throws(() => recipientKey('not a public key'));
  const weak = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString();
  assert.throws(() => recipientKey(weak));
});
