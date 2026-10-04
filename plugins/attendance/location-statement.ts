/**
 * Ostiarius の位置の宣言 (契約 G1) を health 応答から取り出す。
 *
 * GLAB の https 画面から LAN 内の http Ostiarius へは fetch できないため、 宣言は
 * GLAB がサーバ側の health probe で受け取り、 Aedilis への中継に添える。 署名の
 * 検証は Aedilis の責務 (G3-2) で、 ここでは形だけを見る。
 */

export interface LocationStatementClaims {
  lanId: string;
  facilityId: string;
  issuedAt: number;
}

/** probe の payload から最新の locationStatement を返す。 無い・空なら null。 */
export function locationStatementFromHealth(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const statement = (payload as Record<string, unknown>).locationStatement;
  if (typeof statement !== 'string') return null;
  const trimmed = statement.trim();
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : null;
}

/**
 * 宣言の payload を署名検証なしで読む。 Aedilis が宣言を検証して 200 を返した後に、
 * GLAB の台帳へ施設を書くためだけに使う (この値で認可判断をしない)。
 */
export function readLocationStatementClaims(statement: string): LocationStatementClaims | null {
  const [encoded] = statement.split('.');
  if (!encoded) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (payload.purpose !== 'location') return null;
    if (typeof payload.lanId !== 'string' || !payload.lanId) return null;
    if (typeof payload.facilityId !== 'string' || !payload.facilityId) return null;
    if (typeof payload.issuedAt !== 'number' || !Number.isFinite(payload.issuedAt)) return null;
    return { lanId: payload.lanId, facilityId: payload.facilityId, issuedAt: payload.issuedAt };
  } catch {
    return null;
  }
}
