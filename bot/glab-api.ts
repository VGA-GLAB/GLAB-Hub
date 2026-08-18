// GLAB Hub の external API (service token 認可) を叩く共通クライアント。
//
// consult モジュールのルートは Corpus が `/api/x/<moduleId>` へ mount するので、
// bot から見た到達パスは `/api/x/consult/external/...` になる
// (projects と同じ事情 — spec/interface/projects-registry.md)。 GLAB_BASE_URL には
// hub のルート (例 `https://glab.example`) を入れる。
//
// 「到達できなかった (未設定 / 通信失敗 / 認可失敗)」と「hub が null を返した
// (= 連携未登録)」を呼び出し側が区別できるよう、 結果は判別可能な形で返す。

import type { BotConfig } from './config.ts';

const CONSULT_API_BASE = '/api/x/consult';

type GlabResult<T> = { ok: true; data: T } | { ok: false; status: number | null };

/** GLAB 連携 (base URL + service token) が設定済みか。 未設定なら degraded 扱い。 */
export function glabConfigured(cfg: BotConfig): boolean {
  return Boolean(cfg.glabBaseUrl && cfg.glabServiceToken);
}

export async function glabExternal<T>(
  cfg: BotConfig,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<GlabResult<T>> {
  const url = `${cfg.glabBaseUrl.replace(/\/+$/, '')}${CONSULT_API_BASE}${path}`;
  const hasBody = options.body !== undefined;
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      'x-glab-service-token': cfg.glabServiceToken,
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
