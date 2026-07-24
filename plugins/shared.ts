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

const PRIVATE_NO_STORE = 'private, no-store';

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
    return new Response(
      JSON.stringify({ error: 'connector_error', connector: conn.id, detail: String(e) }),
      {
        status: 502,
        headers: {
          'cache-control': PRIVATE_NO_STORE,
          'content-type': 'application/json',
        },
      },
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
