// Cernere service token の受け側検証 (認証集約 P4)。
//
// 参照実装は Cernere server/src/auth/service-token.ts の verifyServiceTokenPaseto /
// hasServiceScope。 署名・kind・exp・aud (= GLAB の storage_slug)・endpoint の scope を照合し、
// 呼出元名 (sub) では分岐しない。 公開鍵は Cernere `/.well-known/cernere-public-key` から取り、
// 応答の max-age (600 秒) に合わせてメモリにキャッシュする。
//
// GLAB の Corpus はユーザ token を Cernere `/api/auth/me` 照会で検証しており、
// 再利用できる公開鍵の取得経路が無いため、 ここで持つ。

import {
  pasetoFooterKid,
  verifyPasetoV4Public,
  type PasetoVerifyKey,
} from './paseto-v4-public.ts';

const KEY_CACHE_MS = 600_000;
/** 未知の kid を見たときの再取得は、 この間隔より頻繁にしない (偽 kid で Cernere を叩かせない)。 */
const KEY_REFRESH_MIN_INTERVAL_MS = 30_000;
const KEY_FETCH_TIMEOUT_MS = 5_000;

export type ServiceClaimsDecision = 'ok' | 'invalid' | 'insufficient_scope';

export type ServiceTokenVerification =
  | { status: 'ok'; subject: string }
  | { status: 'invalid' }
  | { status: 'insufficient_scope' }
  | { status: 'unavailable' };

export interface ServiceTokenVerifier {
  verify(token: string, requiredScope: string): Promise<ServiceTokenVerification>;
}

/** 固定トークンと同じヘッダで届いた値のうち、 PASETO v4.public は Cernere service token として扱う。 */
export function isServiceTokenCandidate(token: string): boolean {
  return token.startsWith('v4.public.');
}

/**
 * 署名検証済みの claims を判定する。 kind / sub / scope の形・exp・aud を見て、
 * 形が崩れている・期限切れ・宛先違いは invalid、 scope 不足は insufficient_scope。
 */
export function decideServiceClaims(
  claims: Record<string, unknown>,
  audience: string,
  requiredScope: string,
  nowMs: number,
): ServiceClaimsDecision {
  if (claims.kind !== 'service') return 'invalid';
  if (typeof claims.sub !== 'string' || !claims.sub) return 'invalid';
  if (!Array.isArray(claims.scope) || !claims.scope.every((s) => typeof s === 'string')) return 'invalid';
  if (!audience || claims.aud !== audience) return 'invalid';
  const exp = typeof claims.exp === 'string' ? Date.parse(claims.exp) : NaN;
  if (!Number.isFinite(exp) || exp <= nowMs) return 'invalid';
  const nbf = typeof claims.nbf === 'string' ? Date.parse(claims.nbf) : NaN;
  if (Number.isFinite(nbf) && nbf > nowMs) return 'invalid';
  return (claims.scope as string[]).includes(requiredScope) ? 'ok' : 'insufficient_scope';
}

export interface CernereServiceTokenVerifierOptions {
  cernereBaseUrl: string;
  /** GLAB 自身の Cernere managed project の storage_slug (token の aud)。 */
  audience: string;
  fetch?: typeof fetch;
  now?: () => number;
}

export class CernereServiceTokenVerifier implements ServiceTokenVerifier {
  private readonly baseUrl: string;
  private readonly audience: string;
  private readonly fetchImpl: () => typeof fetch;
  private readonly now: () => number;
  private keys: PasetoVerifyKey[] | null = null;
  private fetchedAt = 0;
  private inFlight: Promise<PasetoVerifyKey[] | null> | null = null;

  constructor(options: CernereServiceTokenVerifierOptions) {
    this.baseUrl = options.cernereBaseUrl.trim().replace(/\/+$/, '');
    this.audience = options.audience.trim();
    this.fetchImpl = () => options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  async verify(token: string, requiredScope: string): Promise<ServiceTokenVerification> {
    if (!this.baseUrl || !this.audience) return { status: 'unavailable' };
    let keys = await this.currentKeys(false);
    const kid = pasetoFooterKid(token);
    if (keys && kid && !keys.some((key) => key.kid === kid)) keys = await this.currentKeys(true);
    if (!keys) return { status: 'unavailable' };

    const claims = verifyPasetoV4Public(token, keys);
    if (!claims) return { status: 'invalid' };
    const decision = decideServiceClaims(claims, this.audience, requiredScope, this.now());
    if (decision === 'ok') return { status: 'ok', subject: claims.sub as string };
    return { status: decision };
  }

  private async currentKeys(forceRefresh: boolean): Promise<PasetoVerifyKey[] | null> {
    const age = this.now() - this.fetchedAt;
    const fresh = this.keys && age < KEY_CACHE_MS;
    const mayRefresh = !this.keys || age >= KEY_REFRESH_MIN_INTERVAL_MS;
    if (fresh && !(forceRefresh && mayRefresh)) return this.keys;
    if (!mayRefresh) return this.keys;
    this.inFlight ??= this.fetchKeys().finally(() => { this.inFlight = null; });
    const fetched = await this.inFlight;
    // 取得に失敗しても、 期限内の既知鍵があれば使い続ける。
    return fetched ?? (fresh ? this.keys : null);
  }

  private async fetchKeys(): Promise<PasetoVerifyKey[] | null> {
    try {
      const response = await this.fetchImpl()(`${this.baseUrl}/.well-known/cernere-public-key`, {
        signal: AbortSignal.timeout(KEY_FETCH_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const body = await response.json() as { keys?: Array<{ kid?: unknown; public_key?: unknown }> };
      const keys = (body.keys ?? []).flatMap((key) =>
        typeof key.kid === 'string' && typeof key.public_key === 'string'
          ? [{ kid: key.kid, publicKey: Buffer.from(key.public_key, 'base64') }]
          : []);
      if (keys.length === 0) return null;
      this.keys = keys;
      this.fetchedAt = this.now();
      return keys;
    } catch {
      return null;
    }
  }
}
