// Cernere service token の発行とプロセス内キャッシュ (認証集約 P4 の送り側共通部)。
//
// GLAB が外部 API を呼ぶ 2 経路 (bot → GLAB `/external/*`、 progress → Calliope `/api/*`)
// で共有する。 Cernere project client credentials を Cernere `POST /api/auth/service-token`
// にだけ提示し、 返った短命 PASETO を `exp - 60 秒` までメモリに保持する。
// token はディスクにもログにも書かない。
//
// plugins/ 直下の *ファイル* なので Corpus のプラグインローダからは拾われない。
// bot からも import するので corpus/ (Hono) には依存しない。
//
// 契約: Cernere spec/feature/service-token.md、 Corpus spec/plan/auth-plane-consolidation.md §6 P4。

/** 期限の 60 秒前に取り直す (Cernere 側との時計ずれと送信中の失効を避ける)。 */
const REFRESH_MARGIN_MS = 60_000;
/** 発行失敗を短時間覚えて、 呼び出しごとに Cernere を叩かない (rate limit 60 回 / 300 秒)。 */
const FAILURE_BACKOFF_MS = 30_000;
const ISSUE_TIMEOUT_MS = 5_000;

export type ServiceTokenFailure =
  | 'credentials_missing'
  | 'target_missing'
  | 'unauthorized'
  | 'scope_undeclared'
  | 'target_not_found'
  | 'issuer_unavailable'
  | 'issuer_error'
  | 'network'
  | 'malformed_response';

export type ServiceTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: ServiceTokenFailure };

export interface ServiceTokenSourceConfig {
  cernereBaseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  targetProjectKey?: string;
}

export interface ServiceTokenSourceDeps {
  /** 既定は呼び出し時点の globalThis.fetch (テストで差し替えられるよう遅延参照)。 */
  fetch?: typeof fetch;
  now?: () => number;
}

/** 発行時刻と expiresIn から、 キャッシュを手放す時刻を決める。 */
export function serviceTokenCacheDeadline(issuedAtMs: number, expiresInSec: number): number {
  return issuedAtMs + expiresInSec * 1000 - REFRESH_MARGIN_MS;
}

/** Cernere の発行失敗 HTTP status を理由コードへ写す (spec/feature/service-token.md)。 */
export function serviceTokenFailureFromStatus(status: number): ServiceTokenFailure {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'scope_undeclared';
  if (status === 404) return 'target_not_found';
  if (status === 503) return 'issuer_unavailable';
  return 'issuer_error';
}

export class CernereServiceTokenSource {
  private readonly config: Required<ServiceTokenSourceConfig>;
  private readonly fetchImpl: () => typeof fetch;
  private readonly now: () => number;
  private cached: { token: string; deadline: number } | null = null;
  private failure: { reason: ServiceTokenFailure; until: number } | null = null;
  private inFlight: Promise<ServiceTokenResult> | null = null;

  constructor(config: ServiceTokenSourceConfig, deps: ServiceTokenSourceDeps = {}) {
    this.config = {
      cernereBaseUrl: (config.cernereBaseUrl ?? '').trim().replace(/\/+$/, ''),
      clientId: (config.clientId ?? '').trim(),
      clientSecret: (config.clientSecret ?? '').trim(),
      targetProjectKey: (config.targetProjectKey ?? '').trim(),
    };
    this.fetchImpl = () => deps.fetch ?? globalThis.fetch;
    this.now = deps.now ?? Date.now;
  }

  async getToken(): Promise<ServiceTokenResult> {
    const { cernereBaseUrl, clientId, clientSecret, targetProjectKey } = this.config;
    if (!cernereBaseUrl || !clientId || !clientSecret) return { ok: false, reason: 'credentials_missing' };
    if (!targetProjectKey) return { ok: false, reason: 'target_missing' };

    const now = this.now();
    if (this.cached && this.cached.deadline > now) return { ok: true, token: this.cached.token };
    if (this.failure && this.failure.until > now) return { ok: false, reason: this.failure.reason };
    // 同時呼び出しで発行を重複させない。
    this.inFlight ??= this.issue().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async issue(): Promise<ServiceTokenResult> {
    const result = await this.request();
    if (result.ok) {
      this.cached = { token: result.token, deadline: serviceTokenCacheDeadline(this.now(), result.expiresIn) };
      this.failure = null;
      return { ok: true, token: result.token };
    }
    this.cached = null;
    this.failure = { reason: result.reason, until: this.now() + FAILURE_BACKOFF_MS };
    return result;
  }

  private async request(): Promise<{ ok: true; token: string; expiresIn: number } | { ok: false; reason: ServiceTokenFailure }> {
    const { cernereBaseUrl, clientId, clientSecret, targetProjectKey } = this.config;
    let response: Response;
    try {
      // client credentials は Cernere 以外へ送らない。
      response = await this.fetchImpl()(`${cernereBaseUrl}/api/auth/service-token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          target_project_key: targetProjectKey,
        }),
        signal: AbortSignal.timeout(ISSUE_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, reason: 'network' };
    }
    if (!response.ok) return { ok: false, reason: serviceTokenFailureFromStatus(response.status) };
    const body = await response.json().catch(() => null) as { accessToken?: unknown; expiresIn?: unknown } | null;
    const token = typeof body?.accessToken === 'string' ? body.accessToken.trim() : '';
    const expiresIn = typeof body?.expiresIn === 'number' ? body.expiresIn : NaN;
    if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) return { ok: false, reason: 'malformed_response' };
    return { ok: true, token, expiresIn };
  }
}
