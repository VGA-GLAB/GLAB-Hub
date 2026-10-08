// Odeum 中継 (odeum-relay) 向けチケットの発行。
//
// 形式は JWS compact / alg EdDSA (Ed25519) / kid 必須
// (spec/plan/2026-10-04-odeum-live-presentation-design.md「チケット」)。
// チケットは bearer credential なので、 呼び出し側はログに出さないこと。

import { createPrivateKey, createPublicKey, randomUUID, sign, type KeyObject } from 'node:crypto';

export type OdeumTicketRole = 'presenter' | 'viewer' | 'service';

export const TICKET_ISSUER = 'glab';
export const TICKET_AUDIENCE = 'odeum-relay';
/** 設計上の上限 (発行から最大 5 分)。 */
export const MAX_TICKET_TTL_SECONDS = 300;
/** 中継が受け付ける表示名の上限 (文字数)。 */
export const MAX_TICKET_NAME_LENGTH = 64;

export interface TicketSigner {
  kid: string;
  privateKey: KeyObject;
}

export interface TicketSubject {
  /** Cernere user_id (service チケットでは GLab 自身の識別子)。 */
  sub: string;
  /** 表示名。 64 文字を超える分は切り詰める。 */
  name: string;
  role: OdeumTicketRole;
  /** 発表セッション id。 presenter / viewer では必須、 service では持たない。 */
  sid?: string;
  /** presenter だけ: 参加コード / overlay 鍵の SHA-256 (base64url)。 relay が照合に使う。 */
  invite?: { join: string; overlay: string };
}

export interface TicketClaims {
  iss: typeof TICKET_ISSUER;
  aud: typeof TICKET_AUDIENCE;
  sub: string;
  name: string;
  role: OdeumTicketRole;
  sid?: string;
  invite?: { join: string; overlay: string };
  exp: number;
  jti: string;
}

export interface IssueOptions {
  nowMs?: number;
  ttlSeconds?: number;
  jti?: string;
}

export interface IssuedTicket {
  token: string;
  claims: TicketClaims;
}

/** PEM (PKCS#8) の Ed25519 秘密鍵から署名器を作る。 env の `\n` エスケープも受ける。 */
export function loadTicketSigner(privateKeyPem: string, kid: string): TicketSigner {
  const normalizedKid = kid.trim();
  if (!normalizedKid) throw new Error('odeum ticket kid is empty');
  const privateKey = createPrivateKey(privateKeyPem.replace(/\\n/g, '\n').trim());
  if (privateKey.asymmetricKeyType !== 'ed25519') {
    throw new Error('odeum ticket key must be an Ed25519 private key');
  }
  return { kid: normalizedKid, privateKey };
}

/** チケットを署名して JWS compact を返す。 */
export function signOdeumTicket(
  signer: TicketSigner,
  subject: TicketSubject,
  options: IssueOptions = {},
): IssuedTicket {
  if (!subject.sub.trim()) throw new Error('odeum ticket sub is empty');
  if (subject.role === 'service' ? subject.sid != null : !subject.sid) {
    throw new Error(`odeum ${subject.role} ticket has an invalid sid`);
  }
  if (subject.invite && (subject.role !== 'presenter' || subject.invite.join === subject.invite.overlay)) {
    throw new Error('odeum invite claim is only valid on presenter tickets');
  }
  const ttl = Math.min(
    Math.max(1, Math.floor(options.ttlSeconds ?? MAX_TICKET_TTL_SECONDS)),
    MAX_TICKET_TTL_SECONDS,
  );
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const claims: TicketClaims = {
    iss: TICKET_ISSUER,
    aud: TICKET_AUDIENCE,
    sub: subject.sub,
    name: truncateName(subject.name),
    role: subject.role,
    ...(subject.sid ? { sid: subject.sid } : {}),
    ...(subject.invite ? { invite: { join: subject.invite.join, overlay: subject.invite.overlay } } : {}),
    exp: nowSeconds + ttl,
    jti: options.jti ?? randomUUID(),
  };
  const header = { alg: 'EdDSA', typ: 'JWT', kid: signer.kid };
  const signingInput = `${encodeSegment(header)}.${encodeSegment(claims)}`;
  const signature = sign(null, Buffer.from(signingInput), signer.privateKey).toString('base64url');
  return { token: `${signingInput}.${signature}`, claims };
}

/** 中継の `ODEUM_RELAY_TICKET_PUBKEYS` が読む `{ kid: PEM }` 形式。 公開鍵は秘密ではない。 */
export function publicKeysDocument(signer: TicketSigner): Record<string, string> {
  const pem = createPublicKey(signer.privateKey).export({ type: 'spki', format: 'pem' }).toString();
  return { [signer.kid]: pem };
}

function truncateName(name: string): string {
  const chars = Array.from(name.trim());
  return chars.length > MAX_TICKET_NAME_LENGTH
    ? chars.slice(0, MAX_TICKET_NAME_LENGTH).join('')
    : chars.join('');
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}
