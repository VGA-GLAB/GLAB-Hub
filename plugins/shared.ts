// プラグインパック共有ヘルパ。
//
// plugins/ 直下の *ファイル* なので Corpus のプラグインローダ (サブディレクトリ
// 走査) からはモジュールとして拾われない。 connector 系モジュール (出席 / 施設) が
// 共有する。

import type { Context, ServiceConnector } from '../corpus/server/hub/sdk.ts';

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
): Promise<Response> {
  const method = c.req.method;
  const headers: Record<string, string> = {};
  const auth = c.req.header('authorization');
  if (auth) headers['authorization'] = auth;

  const init: RequestInit = { method, headers };
  if (method !== 'GET' && method !== 'HEAD' && method !== 'DELETE') {
    init.body = await c.req.text();
    headers['content-type'] = c.req.header('content-type') ?? 'application/json';
  }

  const search = new URL(c.req.url).search;
  let res: Response;
  try {
    res = await conn.fetch(path + search, init);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'connector_error', connector: conn.id, detail: String(e) }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }
  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
    },
  });
}
