// 外部サービス (bot / Calliope 等) 向け `/external/*` API の認可。
//
// Corpus の requireAuth (Cernere user token 検証) は `/api/*` 全体に既に適用済みで、
// 個々のブラウザユーザの本人性を保証する。 一方 bot / Calliope はサービスとして呼びに
// 来るので、 「どのサービスが呼んでいるか」 を区別する追加ゲートをここで掛ける
// (facility 等の HttpServiceConnector と対になる「受信側」の認可)。
//
// 認証集約 P4 (Corpus spec/plan/auth-plane-consolidation.md §6) の間は新旧両受理:
//   - サービス用ヘッダ (X-Glab-Service-Token / X-ProjectHub-Service-Token) の値が `v4.public.` で始まれば Cernere service token として検証する
//     (署名・kind・exp・aud = GLAB の storage_slug・scope `glab-external:write`)。
//     呼出元名 (sub) では分岐しない。 不正なら 401、 scope 不足なら 403。
//   - それ以外は従来の固定トークン (GLAB_PROJECTS_SERVICE_TOKEN) と timing-safe 照合する。
// Authorization はユーザ token (Corpus requireAuth) と取り合いになるので、 service token は
// 固定トークンと同じサービス用ヘッダで受ける。
//
// spec/interface/projects-registry.md に契約を記録。 corpus/ の requireAuth は
// 変更できない (submodule 改変禁止) ため、 この service token チェックは
// requireAuth の内側 (プラグインルート到達後) で追加の層として働く。

import { timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from '../../corpus/server/hub/sdk.ts';
import { serviceToken, type EnvReader } from '../shared.ts';
import {
  CernereServiceTokenVerifier,
  isServiceTokenCandidate,
  type ServiceTokenVerification,
  type ServiceTokenVerifier,
} from './service-token-verifier.ts';

/** `/external/*` (projects / consult / tech-links) 共通の scope (認証集約 P4 共通契約の語彙)。 */
export const GLAB_EXTERNAL_SCOPE = 'glab-external:write';

/**
 * GLAB の Cernere managed project (`EducationLab`) の storage_slug。
 * Cernere は key を小文字化して slug を払い出す (server/src/project/storage-slug.ts)。
 */
const DEFAULT_SERVICE_TOKEN_AUDIENCE = 'educationlab';

export interface ServiceTokenOptions {
  /** Cernere service token の検証器。 未設定 (null) なら v4.public 値も固定トークン照合に回る (= 不一致で 401)。 */
  verifier?: ServiceTokenVerifier | null;
  /** endpoint が要求する scope。 既定は `glab-external:write`。 */
  scope?: string;
}

export type ServiceAuthDecision =
  | { allow: true }
  | { allow: false; status: 401 | 403 | 503; error: string };

/**
 * 提示値と照合結果から可否を決める (HTTP の外側にある純粋な判定)。
 *
 * - service token の照合結果があれば、 それだけで決める (固定トークンへは落とさない)
 * - 固定トークン未設定は §7.1 (無言フォールバック禁止) に従い、 誰でも通す経路に
 *   落とさず 503 で明示的に拒否する (facility の AEDILIS_BASE_URL 未設定 → 503 と同じ扱い)
 */
export function decideServiceAuth(
  provided: string | null,
  expected: string | undefined,
  serviceVerification: ServiceTokenVerification | null,
): ServiceAuthDecision {
  if (serviceVerification) {
    switch (serviceVerification.status) {
      case 'ok': return { allow: true };
      case 'insufficient_scope': return { allow: false, status: 403, error: 'insufficient_scope' };
      case 'invalid': return { allow: false, status: 401, error: 'invalid_service_token' };
      case 'unavailable': return { allow: false, status: 503, error: 'service_token_verifier_unavailable' };
    }
  }
  const trimmed = expected?.trim();
  if (!trimmed) return { allow: false, status: 503, error: 'service_token_unconfigured' };
  if (!provided || !safeEqual(provided, trimmed)) {
    return { allow: false, status: 401, error: 'invalid_service_token' };
  }
  return { allow: true };
}

export function requireServiceToken(
  expected: string | undefined,
  options: ServiceTokenOptions = {},
): MiddlewareHandler {
  const scope = options.scope ?? GLAB_EXTERNAL_SCOPE;
  return async (c: Context, next) => {
    const provided = extractServiceToken(c);
    const verification = provided?.fromServiceHeader && options.verifier && isServiceTokenCandidate(provided.value)
      ? await options.verifier.verify(provided.value, scope)
      : null;
    const decision = decideServiceAuth(provided?.value ?? null, expected, verification);
    if (!decision.allow) return c.json({ error: decision.error }, decision.status);
    await next();
  };
}

const verifiers = new Map<string, CernereServiceTokenVerifier>();

/** env から service token 検証器を作る (CERNERE_BASE_URL 未設定なら null)。 公開鍵キャッシュを共有するため同設定は 1 個に寄せる。 */
export function serviceTokenVerifier(env: EnvReader): ServiceTokenVerifier | null {
  const cernereBaseUrl = env('CERNERE_BASE_URL')?.trim();
  if (!cernereBaseUrl) return null;
  const audience = env('GLAB_SERVICE_TOKEN_AUDIENCE')?.trim() || DEFAULT_SERVICE_TOKEN_AUDIENCE;
  const key = `${cernereBaseUrl}\n${audience}`;
  let verifier = verifiers.get(key);
  if (!verifier) {
    verifier = new CernereServiceTokenVerifier({ cernereBaseUrl, audience });
    verifiers.set(key, verifier);
  }
  return verifier;
}

/** `/external/*` の共通ガード: Cernere service token と従来の固定トークンの両受理。 */
export function requireExternalServiceAuth(env: EnvReader): MiddlewareHandler {
  return requireServiceToken(serviceToken(env), { verifier: serviceTokenVerifier(env) });
}

/**
 * サービス用ヘッダの値を取る。 X-Glab-Service-Token が正規、 Calliope は従来
 * X-ProjectHub-Service-Token で送ってくるので同じ判定で受ける。 service token として
 * 検証するのはこの 2 ヘッダの値だけ。 Bearer は P4 以前からの固定トークン互換で、
 * ユーザ token (Corpus requireAuth) と同居するため service token としては見ない。
 */
function extractServiceToken(c: Context): { value: string; fromServiceHeader: boolean } | null {
  for (const name of ['x-glab-service-token', 'x-projecthub-service-token']) {
    const header = c.req.header(name);
    if (header && header.trim()) return { value: header.trim(), fromServiceHeader: true };
  }
  const auth = c.req.header('authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return { value: auth.slice(7).trim(), fromServiceHeader: false };
  return null;
}

/** 生トークンを可変時間比較しないための timing-safe 比較。 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
