// GLAB Hub の external API (service token 認可) を叩く共通クライアント。
//
// consult モジュールのルートは Corpus が `/api/x/<moduleId>` へ mount するので、
// bot から見た到達パスは `/api/x/consult/external/...` になる
// (projects と同じ事情 — spec/interface/projects-registry.md)。 GLAB_BASE_URL には
// hub のルート (例 `https://glab.example`) を入れる。
//
// 認可 (認証集約 P4): Cernere service token (target_project_key = EducationLab、
// scope glab-external:write) を X-Glab-Service-Token で送る。 Authorization は Corpus
// requireAuth のユーザ token と取り合いになるため使わない。 発行に失敗したときだけ
// 従来の GLAB_PROJECTS_SERVICE_TOKEN を同じヘッダで送る (P5 で撤去)。
//
// 「到達できなかった (未設定 / 通信失敗 / 認可失敗)」と「hub が null を返した
// (= 連携未登録)」を呼び出し側が区別できるよう、 結果は判別可能な形で返す。

import { CernereServiceTokenSource } from '../plugins/cernere-service-token.ts';
import { makeSenderCredentialProvider, type SenderCredential } from '../plugins/service-credential.ts';
import type { BotConfig } from './config.ts';

const CONSULT_API_BASE = '/api/x/consult';
/** GLAB hub の Cernere managed project key (excubitor.catalog.yaml の cernere_launch_credentials と同じ)。 */
const GLAB_PROJECT_KEY = 'EducationLab';

type GlabResult<T> = { ok: true; data: T } | { ok: false; status: number | null };

const providers = new WeakMap<BotConfig, () => Promise<SenderCredential>>();

/** service token の発行・キャッシュは BotConfig ごとに 1 つ (process memory のみ)。 */
function credentialProvider(cfg: BotConfig): () => Promise<SenderCredential> {
  let provider = providers.get(cfg);
  if (!provider) {
    provider = makeSenderCredentialProvider({
      label: 'glab-external',
      source: new CernereServiceTokenSource({
        cernereBaseUrl: cfg.cernere.baseUrl,
        clientId: cfg.cernere.clientId,
        clientSecret: cfg.cernere.clientSecret,
        targetProjectKey: GLAB_PROJECT_KEY,
      }),
      legacyToken: cfg.glabServiceToken,
    });
    providers.set(cfg, provider);
  }
  return provider;
}

/** GLAB 連携 (base URL + Cernere credentials か固定トークン) が設定済みか。 未設定なら degraded 扱い。 */
export function glabConfigured(cfg: BotConfig): boolean {
  const hasCernereCredentials = Boolean(cfg.cernere.baseUrl && cfg.cernere.clientId && cfg.cernere.clientSecret);
  return Boolean(cfg.glabBaseUrl && (hasCernereCredentials || cfg.glabServiceToken));
}

export async function glabExternal<T>(
  cfg: BotConfig,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<GlabResult<T>> {
  const credential = await credentialProvider(cfg)();
  if (credential.kind === 'none') return { ok: false, status: null };
  const url = `${cfg.glabBaseUrl.replace(/\/+$/, '')}${CONSULT_API_BASE}${path}`;
  const hasBody = options.body !== undefined;
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'x-glab-service-token': credential.token,
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  }).catch(() => null);
  if (!response) return { ok: false, status: null };
  if (!response.ok) return { ok: false, status: response.status };
  try {
    // 本文の null は正当な応答 (例 presence/resolve の「未連携」) なので ok:true で通す。
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: response.status };
  }
}
