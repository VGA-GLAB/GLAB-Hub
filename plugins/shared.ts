// プラグインパック共有ヘルパ。
//
// plugins/ 直下の *ファイル* なので Corpus のプラグインローダ (サブディレクトリ
// 走査) からはモジュールとして拾われない。 connector 系モジュール（施設）が
// 共有する。

import { getUserToken } from '../corpus/server/hub/sdk.ts';
import type {
  Context,
  ServiceConnector,
  TokenProvider,
} from '../corpus/server/hub/sdk.ts';
import { DownstreamTokenError } from '../corpus/server/hub/tokens.ts';
import {
  VersionedHttpServiceConnector,
  type VersionedConnectorOptions,
} from './service-health-connector.ts';

export const PRIVATE_NO_STORE = 'private, no-store';

/** `CorpusContext.env` と同じ形。 env → 設定の写像だけを取る関数に渡す。 */
export type EnvReader = (key: string) => string | undefined;

// ─── Aedilis コネクタ ───────────────────────────────────────
//
// events (予約の作成・取消) と facility (施設・予約の中継) が同じ Aedilis を見る。
// 設定を 2 箇所に置くと id / healthPath がいつのまにか食い違うので、 生成だけを
// ここへ寄せる。 ctx.registerConnector を呼ぶのは facility の 1 箇所のままにする
// (spec/plan/2026-07-16-review-fix-tasks.md T1: 登録の重複はさせない)。

const AEDILIS_CONNECTOR_ID = 'aedilis';

/** Aedilis 側 health (DESIGN.md §7)。 */
const AEDILIS_HEALTH_PATH = '/api/health';

const AEDILIS_BASE_URL_ENV = 'AEDILIS_BASE_URL';

/** 未設定なら空文字 → コネクタが degraded / 503 を返し、 パネルが「未接続」を出す。 */
export function aedilisBaseUrl(env: EnvReader): string {
  return env(AEDILIS_BASE_URL_ENV) ?? '';
}

function aedilisConnectorOptions(env: EnvReader): VersionedConnectorOptions {
  return {
    id: AEDILIS_CONNECTOR_ID,
    title: '施設予約 (Aedilis)',
    scope: 'multi',
    baseUrl: aedilisBaseUrl(env),
    healthPath: AEDILIS_HEALTH_PATH,
  };
}

export function makeAedilisConnector(env: EnvReader): VersionedHttpServiceConnector {
  return new VersionedHttpServiceConnector(aedilisConnectorOptions(env));
}

// ─── 外部サービス向け API の service token ──────────────────
//
// consult / projects / tech-links / volputas の /external/* が同じ 1 本の token で
// 認可される。 env 名を各モジュールに直書きすると改名時に取りこぼすので、 読み取りだけ
// ここへ寄せる (照合そのものは projects/service-auth.ts の requireServiceToken)。

const SERVICE_TOKEN_ENV = 'GLAB_PROJECTS_SERVICE_TOKEN';

export function serviceToken(env: EnvReader): string | undefined {
  return env(SERVICE_TOKEN_ENV);
}

// ─── URL 正規化 ─────────────────────────────────────────────

/**
 * env で受け取った外部サービスの base URL を検証して末尾スラッシュ付きに揃える。
 *
 * 資格情報・クエリ・フラグメントを含む URL は、 そのまま `new URL(path, base)` の
 * 基底にすると意図しない宛先を作るので受け付けない。 未設定 (空) は null を返し、
 * 呼び出し側が「未接続」の分岐に落とす。
 */
export function normalizeHttpBaseUrl(value: string | undefined, envName: string): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${envName} must be an absolute HTTP(S) URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${envName} must use HTTP or HTTPS`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${envName} must not contain credentials, query, or fragment`);
  }

  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.toString();
}

/** 個人向け応答をキャッシュさせない共通ヘッダ設定 (各モジュールのルートから呼ぶ)。 */
export function noStore(c: { header(name: string, value: string): void }): void {
  c.header('cache-control', PRIVATE_NO_STORE);
}

/**
 * 受信リクエストを ServiceConnector 越しに接続先サービスへ中継する。
 *
 * - メソッド / クエリ文字列 / ボディ / Authorization をそのまま転送する
 *   (= 接続先サービスがユーザの Cernere トークンで認可する)。
 * - 接続先が未設定 (baseUrl 空) のときは HttpServiceConnector が 503 を返すので、
 *   それがそのままクライアントへ届く → パネル側で「未接続」表示にできる。
 */
export async function proxy(
  c: Context,
  conn: ServiceConnector,
  path: string,
  tokenProvider: TokenProvider,
  projectKey = conn.id,
): Promise<Response> {
  const method = c.req.method;
  const headers: Record<string, string> = {};

  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    init.body = await c.req.text();
    headers['content-type'] = c.req.header('content-type') ?? 'application/json';
  }

  const search = new URL(c.req.url).search;
  let res: Response;
  try {
    res = await authorizedConnectorFetch(
      c,
      conn,
      path + search,
      tokenProvider,
      projectKey,
      init,
    );
  } catch (e) {
    if (e instanceof DownstreamTokenError) {
      return Response.json({
        error: 'downstream_token_unavailable',
        connector: conn.id,
        upstreamStatus: e.status,
      }, {
        status: 502,
        headers: { 'cache-control': PRIVATE_NO_STORE },
      });
    }
    return Response.json(
      { error: 'connector_error', connector: conn.id },
      { status: 502, headers: { 'cache-control': PRIVATE_NO_STORE } },
    );
  }
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      'cache-control': PRIVATE_NO_STORE,
      'content-type': res.headers.get('content-type') ?? 'application/json',
    },
  });
}

/**
 * proxy() のバイナリ版。 本文と応答をストリームのまま流す。
 *
 * proxy() は本文を `c.req.text()` で読み、 応答も一度テキストにしてから返す。
 * 動画にはどちらも使えない (文字列化で壊れる・メモリに載る) ので、 中継の
 * 経路だけを差し替えたものを別に置く。 認可の載せ方は proxy() と同じ。
 */
export async function proxyStream(
  c: Context,
  conn: ServiceConnector,
  path: string,
  tokenProvider: TokenProvider,
  projectKey = conn.id,
): Promise<Response> {
  const method = c.req.method;
  const headers = new Headers();
  // 動画要素はシーク時に Range を送る。これを落とすと常に先頭から全量を
  // 返すことになり、長い動画の再生・シークが壊れる。
  const range = c.req.header('range');
  if (range) headers.set('range', range);
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    init.body = c.req.raw.body;
    headers.set('content-type', c.req.header('content-type') ?? 'application/octet-stream');
    // Node の fetch は本文がストリームのとき duplex の明示を要求する。
    (init as RequestInit & { duplex?: string }).duplex = 'half';
  }

  const search = new URL(c.req.url).search;
  let res: Response;
  try {
    res = await authorizedConnectorFetch(c, conn, path + search, tokenProvider, projectKey, init);
  } catch (e) {
    if (e instanceof DownstreamTokenError) {
      return Response.json({
        error: 'downstream_token_unavailable',
        connector: conn.id,
        upstreamStatus: e.status,
      }, {
        status: 502,
        headers: { 'cache-control': PRIVATE_NO_STORE },
      });
    }
    return Response.json(
      { error: 'connector_error', connector: conn.id },
      { status: 502, headers: { 'cache-control': PRIVATE_NO_STORE } },
    );
  }
  const responseHeaders = new Headers({ 'cache-control': PRIVATE_NO_STORE });
  const contentType = res.headers.get('content-type');
  if (contentType) responseHeaders.set('content-type', contentType);
  const contentLength = res.headers.get('content-length');
  if (contentLength) responseHeaders.set('content-length', contentLength);
  const contentRange = res.headers.get('content-range');
  if (contentRange) responseHeaders.set('content-range', contentRange);
  const acceptRanges = res.headers.get('accept-ranges');
  if (acceptRanges) responseHeaders.set('accept-ranges', acceptRanges);
  return new Response(res.body, { status: res.status, headers: responseHeaders });
}

export async function authorizedConnectorFetch(
  c: Context,
  connector: ServiceConnector,
  path: string,
  tokenProvider: TokenProvider,
  projectKey = connector.id,
  init: RequestInit = {},
): Promise<Response> {
  const token = await tokenProvider.getDownstreamToken(getUserToken(c), {
    service: connector.id,
    projectKey,
    baseUrl: connector.baseUrl,
  });
  const headers = new Headers(init.headers);
  if (token) headers.set('authorization', `Bearer ${token}`);
  return connector.fetch(path, { ...init, headers });
}
