// Calliope 進捗 API の読み出し中継。
//
// GLAB は表示面なので、 レスポンスを解釈も再計算も保存もしない (エンジンは Calliope)。
// ここがやるのは「クエリを転送して、 結果をキャッシュ不可で素通しする」ことと、
// 未設定 / 未稼働 を パネルが degraded 表示に落とせる形へ正規化することだけ。

import type { ServiceConnector } from '../../corpus/server/hub/sdk.ts';
import { PRIVATE_NO_STORE } from '../shared.ts';
import { CALLIOPE_PROGRESS_PATH } from './connector.ts';

/**
 * 進捗取得の上限待ち時間。 Calliope は GLAB/Actio/Memoria へ fan-out するので
 * health 用の 5 秒では切れるが、 無制限にすると応答しない Calliope が hub の
 * リクエストを掴んだままになる。 その中間を取る。
 */
const PROGRESS_TIMEOUT_MS = 30_000;

/**
 * `GET /api/x/progress/progress` → Calliope `GET /api/glab/progress`。
 *
 * - baseUrl 未設定: コネクタが 503 `connector_unconfigured` を返し、 それを素通しする。
 * - Calliope 未稼働 (ECONNREFUSED 等で fetch が throw) / 無応答 (タイムアウト):
 *   502 `connector_error` に写す。 ここで握り潰さず throw させると Hono が 500 を返し、
 *   パネルが「未接続」か「サーバ不具合」かを区別できなくなる。
 * - それ以外: Calliope のステータス / ボディをそのまま返す (400/502 も透過)。
 */
export async function readProgress(
  connector: ServiceConnector,
  search = '',
): Promise<Response> {
  try {
    const upstream = await connector.fetch(`${CALLIOPE_PROGRESS_PATH}${search}`, {
      signal: AbortSignal.timeout(PROGRESS_TIMEOUT_MS),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'cache-control': PRIVATE_NO_STORE,
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (error) {
    return Response.json(
      { error: 'connector_error', connector: connector.id, detail: String(error) },
      { status: 502, headers: { 'cache-control': PRIVATE_NO_STORE } },
    );
  }
}
