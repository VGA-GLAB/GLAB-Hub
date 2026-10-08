// Odeum のログイン不要参加 (参加コード) と OBS 番組オーバーレイ鍵。
//
// 平文は保存しない。 チケット署名鍵 (Vault の secret) から導いた鍵で発表セッション id を
// HMAC して毎回同じ値を作る。 relay には presenter チケットの invite claim で SHA-256
// (base64url) だけを渡す (Odeum spec/feature/program-overlay-guest-join.md)。
// どちらも bearer credential なのでログに出さない。

import { createHash, createHmac, type KeyObject } from 'node:crypto';

/** Crockford base32 (I/L/O/U を含まない)。 relay の正規化と同じ表。 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const GUEST_CODE_LENGTH = 10;
const SECRET_LABEL = 'glab/odeum-invite/v1';

export interface OdeumInvitation {
  guestCode: string;
  overlayKey: string;
}

export interface InviteClaim {
  join: string;
  overlay: string;
}

/** チケット署名鍵から招待用の秘密を導く (署名鍵そのものは HMAC に使わない)。 */
export function invitationSecret(privateKey: KeyObject): Buffer {
  return createHash('sha256')
    .update(SECRET_LABEL)
    .update(privateKey.export({ type: 'pkcs8', format: 'der' }))
    .digest();
}

/** セッションごとの参加コード (10 文字 = 50 bit) と overlay 鍵 (32 byte base64url)。 */
export function deriveInvitation(secret: Buffer, sessionId: string): OdeumInvitation {
  const mac = (purpose: string): Buffer => createHmac('sha256', secret).update(`${purpose}\0${sessionId}`).digest();
  const joinBytes = mac('join');
  let bits = 0n;
  for (const byte of joinBytes.subarray(0, 7)) bits = (bits << 8n) | BigInt(byte);
  let guestCode = '';
  for (let i = 0; i < GUEST_CODE_LENGTH; i += 1) {
    guestCode += CROCKFORD[Number((bits >> BigInt(51 - i * 5)) & 31n)];
  }
  return { guestCode, overlayKey: mac('overlay').toString('base64url') };
}

export function sha256Base64Url(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('base64url');
}

/** presenter チケットの invite claim。 */
export function inviteClaim(invitation: OdeumInvitation): InviteClaim {
  return { join: sha256Base64Url(invitation.guestCode), overlay: sha256Base64Url(invitation.overlayKey) };
}

/** 読み上げ・手入力しやすい表示形 (ABCDE-FGH12)。 relay はハイフンを無視する。 */
export function formatGuestCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** 参加ページ。 コードは fragment に載せ、 リクエスト行やリファラに出さない。 */
export function guestJoinUrl(base: string, code: string): string {
  return `${new URL('join', base).toString()}#code=${encodeURIComponent(code)}`;
}

/** OBS ブラウザソースに貼る番組オーバーレイ URL。 */
export function overlayUrl(base: string, key: string): string {
  return `${new URL('overlay', base).toString()}#key=${encodeURIComponent(key)}`;
}
