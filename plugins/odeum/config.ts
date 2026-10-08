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
/** スマホ (同じ Wi-Fi) から届く relay の URL。 未設定なら ODEUM_RELAY_URL。 */
export const GUEST_BASE_URL_ENV = 'ODEUM_GUEST_BASE_URL';
/** OBS (親機) から届く relay の URL。 未設定なら ODEUM_RELAY_URL。 */
export const OVERLAY_BASE_URL_ENV = 'ODEUM_OVERLAY_BASE_URL';

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

export interface InvitationBases {
  /** 参加ページの base (http(s)、 末尾スラッシュ付き)。 */
  guest: string;
  /** 番組オーバーレイの base (http(s)、 末尾スラッシュ付き)。 */
  overlay: string;
}

export interface OdeumConfig {
  relay: RelayEndpoints | null;
  /** relay が無い・base が不正なら null (招待の表示だけを止める)。 */
  invitationBases: InvitationBases | null;
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

/** 招待 URL の base。 未設定は relay の HTTP base、 指定時は http(s) の origin+path だけ受ける。 */
export function invitationBases(env: EnvReader, relay: RelayEndpoints | null): InvitationBases | null {
  if (!relay) return null;
  const base = (key: string): string | null => {
    const value = env(key)?.trim();
    if (!value) return relay.httpBase;
    try {
      const endpoints = relayEndpoints(value);
      return endpoints && /^https?:/.test(value) ? endpoints.httpBase : null;
    } catch {
      return null;
    }
  };
  const guest = base(GUEST_BASE_URL_ENV);
  const overlay = base(OVERLAY_BASE_URL_ENV);
  return guest && overlay ? { guest, overlay } : null;
}

export function resolveOdeumConfig(env: EnvReader): OdeumConfig {
  let relay: RelayEndpoints | null;
  try {
    relay = relayEndpoints(env(RELAY_URL_ENV));
  } catch {
    return { relay: null, invitationBases: null, signer: null, disabledReason: 'relay_url_invalid' };
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
    invitationBases: invitationBases(env, relay),
    signer,
    disabledReason: relay ? keyReason : 'relay_url_missing',
  };
}
