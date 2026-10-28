// @implements SPEC-GLAB-COCOIRU-DISTRIBUTION-001
import { createHash, constants, verify, X509Certificate } from 'node:crypto';

export const MAX_PAYLOAD = 16 * 1024 * 1024;
export const MAX_RELEASE = 24 * 1024 * 1024;
export interface ReleaseManifest {
  format: 'glab-library-v1'; id: string; version: string; filename: string;
  bytes: number; sha256: string; platform: string; kind: string;
}
export function decode64(value: unknown, max: number): Buffer {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(max / 3)
    || value.length % 4 !== 0) throw new Error('Invalid encoding');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > max || bytes.toString('base64') !== value) throw new Error('Invalid encoding');
  return bytes;
}
/** Exact leaf-certificate pin is provisioned separately; a downloaded cert cannot establish trust. */
export function verifyRelease(raw: Buffer, fingerprint: string, now = Date.now()): { manifest: ReleaseManifest; payload: Buffer } {
  if (raw.length > MAX_RELEASE || !/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Release configuration invalid');
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as Record<string, unknown>;
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'certificate,manifest,payload,signature') throw new Error('Invalid release');
  const signed = decode64(value.manifest, 4096), signature = decode64(value.signature, 1024);
  const cert = new X509Certificate(decode64(value.certificate, 8192));
  if (cert.fingerprint256.replaceAll(':', '').toLowerCase() !== fingerprint
    || !(Date.parse(cert.validFrom) <= now && now < Date.parse(cert.validTo))
    || !cert.keyUsage?.includes('1.3.6.1.5.5.7.3.3') || cert.ca
    || cert.publicKey.asymmetricKeyType !== 'rsa'
    || (cert.publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 3072
    || !verify('sha256', signed, { key: cert.publicKey, padding: constants.RSA_PKCS1_PADDING }, signature)) throw new Error('Untrusted release');
  const manifest = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(signed)) as ReleaseManifest;
  if (!manifest || manifest.format !== 'glab-library-v1'
    || typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(manifest.id)
    || typeof manifest.version !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(manifest.version)
    || typeof manifest.filename !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(manifest.filename)
    || !['windows', 'macos', 'linux', 'any'].includes(manifest.platform)
    || !['runtime', 'plugin', 'sdk'].includes(manifest.kind)
    || typeof manifest.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(manifest.sha256)
    || !Number.isSafeInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > MAX_PAYLOAD) throw new Error('Invalid manifest');
  const payload = decode64(value.payload, MAX_PAYLOAD);
  if (payload.length !== manifest.bytes || createHash('sha256').update(payload).digest('hex') !== manifest.sha256) throw new Error('Payload integrity failure');
  return { manifest, payload };
}
