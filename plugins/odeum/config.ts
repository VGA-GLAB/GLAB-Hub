// Odeum プラグインの設定解決。
//
// 中継の URL は Excubitor topology の `ODEUM_RELAY_URL` (ハードコードしない)、
// チケット署名鍵は Excubitor Vault から注入される secret。 どれかが欠けても hub は
// 止めず、 odeum 機能だけを無効として理由を返す。

import type { EnvReader } from '../shared.ts';
import { loadTicketSigner, type TicketSigner } from './ticket.ts';

export const RELAY_URL_ENV = 'ODEUM_RELAY_URL';
export const TICKET_PRIVATE_KEY_ENV = 'GLAB_ODEUM_TICKET_PRIVATE_KEY';
export const TICKET_KID_ENV = 'GLAB_ODEUM_TICKET_KID';

export interface RelayEndpoints {
  /** HTTP(S) の base URL (末尾スラッシュ付き)。 health / sessions 用。 */
  httpBase: string;
  /** WS(S) の base URL (末尾スラッシュ付き)。 ブラウザ視聴と発表者アプリ用。 */
  wsBase: string;
}

export type OdeumDisabledReason =
  | 'relay_url_missing'
  | 'relay_url_invalid'
  | 'ticket_key_missing'
  | 'ticket_key_invalid';

export interface OdeumConfig {
  relay: RelayEndpoints | null;
  signer: TicketSigner | null;
  /** null なら有効。 */
  disabledReason: OdeumDisabledReason | null;
}

/** http/https/ws/wss のいずれかで書かれた中継 URL から両方の base を作る。 */
export function relayEndpoints(value: string | undefined): RelayEndpoints | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  const url = new URL(candidate);
  const secure = url.protocol === 'https:' || url.protocol === 'wss:';
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    throw new Error(`${RELAY_URL_ENV} must use http(s) or ws(s)`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${RELAY_URL_ENV} must not contain credentials, query, or fragment`);
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  const rest = url.toString().slice(url.protocol.length);
  return {
    httpBase: `${secure ? 'https:' : 'http:'}${rest}`,
    wsBase: `${secure ? 'wss:' : 'ws:'}${rest}`,
  };
}

export function resolveOdeumConfig(env: EnvReader): OdeumConfig {
  let relay: RelayEndpoints | null;
  try {
    relay = relayEndpoints(env(RELAY_URL_ENV));
  } catch {
    return { relay: null, signer: null, disabledReason: 'relay_url_invalid' };
  }

  const pem = env(TICKET_PRIVATE_KEY_ENV)?.trim();
  const kid = env(TICKET_KID_ENV)?.trim();
  let signer: TicketSigner | null = null;
  let keyReason: OdeumDisabledReason | null = null;
  if (!pem || !kid) {
    keyReason = 'ticket_key_missing';
  } else {
    try {
      signer = loadTicketSigner(pem, kid);
    } catch {
      keyReason = 'ticket_key_invalid';
    }
  }

  return {
    relay,
    signer,
    disabledReason: relay ? keyReason : 'relay_url_missing',
  };
}
