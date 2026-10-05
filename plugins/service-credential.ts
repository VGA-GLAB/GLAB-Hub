// 送り側の credential 選択 (認証集約 P4 の移行期間ルール)。
//
// Cernere service token を優先し、 発行に失敗したとき (credentials 未設定 / 401 /
// 403 scope 未宣言 / 404 / ネットワーク等) に限って、 固定トークンが設定されていれば
// それで送る。 固定トークンへのフォールバックは P5 で撤去する。
// 理由コードだけを 1 行ログに出し、 token / credentials の値は出さない。
//
// bot からも import するので corpus/ には依存しない。

import type { CernereServiceTokenSource, ServiceTokenFailure, ServiceTokenResult } from './cernere-service-token.ts';

export type SenderCredential =
  | { kind: 'service_token'; token: string }
  | { kind: 'legacy'; token: string; reason: ServiceTokenFailure }
  | { kind: 'none'; reason: ServiceTokenFailure };

/** 発行結果と固定トークンから、 今回送る credential を決める。 */
export function selectSenderCredential(issued: ServiceTokenResult, legacyToken: string | undefined): SenderCredential {
  if (issued.ok) return { kind: 'service_token', token: issued.token };
  const legacy = legacyToken?.trim();
  if (legacy) return { kind: 'legacy', token: legacy, reason: issued.reason };
  return { kind: 'none', reason: issued.reason };
}

export interface SenderCredentialProviderOptions {
  /** ログに出す送り先の名前 (例 `calliope`)。 */
  label: string;
  source: CernereServiceTokenSource;
  legacyToken?: string;
  log?: (line: string) => void;
}

/**
 * 呼び出しごとに credential を返す関数を作る。 フォールバック / 送信不可のログは
 * 理由が変わったときだけ出す (scheduler の巡回ごとに同じ行を積まない)。
 */
export function makeSenderCredentialProvider(options: SenderCredentialProviderOptions): () => Promise<SenderCredential> {
  const log = options.log ?? ((line: string) => console.warn(line));
  let lastLogged: string | null = null;
  return async () => {
    const credential = selectSenderCredential(await options.source.getToken(), options.legacyToken);
    if (credential.kind === 'service_token') {
      lastLogged = null;
      return credential;
    }
    const state = `${credential.kind}:${credential.reason}`;
    if (state !== lastLogged) {
      log(credential.kind === 'legacy'
        ? `[glab] ${options.label}: service token unavailable (reason=${credential.reason}); falling back to legacy fixed token`
        : `[glab] ${options.label}: service token unavailable (reason=${credential.reason}) and no legacy token configured`);
    }
    lastLogged = state;
    return credential;
  };
}
