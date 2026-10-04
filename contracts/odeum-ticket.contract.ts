import { createPublicKey, verify } from 'node:crypto';
import type { IssueOptions, IssuedTicket, TicketSigner, TicketSubject } from '../plugins/odeum/ticket.ts';

const decode = (segment: string): Record<string, unknown> =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;

export default {
  /** C-2: EdDSA + kid、 設計どおりの claims、 exp ≤ 5 分、 公開鍵で署名を検証できる。 */
  post: (issued: IssuedTicket, signer: TicketSigner, subject: TicketSubject, options: IssueOptions = {}): boolean => {
    const [header, payload, signature] = issued.token.split('.');
    if (!header || !payload || !signature) return false;
    const head = decode(header);
    const claims = decode(payload);
    const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
    const exp = Number(claims.exp);
    return head.alg === 'EdDSA' && head.kid === signer.kid
      && claims.iss === 'glab' && claims.aud === 'odeum-relay'
      && claims.sub === subject.sub && claims.role === subject.role
      && (subject.role === 'service' ? !('sid' in claims) : claims.sid === subject.sid)
      && typeof claims.name === 'string' && Array.from(claims.name).length <= 64
      && typeof claims.jti === 'string' && claims.jti.length > 0
      && exp > nowSeconds && exp - nowSeconds <= 300
      && verify(null, Buffer.from(`${header}.${payload}`), createPublicKey(signer.privateKey),
        Buffer.from(signature, 'base64url'));
  },
};
