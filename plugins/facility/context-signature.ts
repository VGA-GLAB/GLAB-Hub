import { createHash, createHmac } from 'node:crypto';
import type { BookingGroup } from './groups.ts';

/** Request-bound membership assertion. The downstream user token still establishes identity. */
export function signBookingContext(
  secret: string, userId: string, groups: BookingGroup[], method: string, path: string,
  body: string, now = Date.now(),
): string {
  if (Buffer.byteLength(secret) < 32) throw new Error('Booking context secret must contain at least 32 bytes');
  const payload = Buffer.from(JSON.stringify({
    version: 1, source: 'glab', userId, groups, method, path,
    bodyHash: createHash('sha256').update(body).digest('hex'), expiresAt: now + 30_000,
  })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}
