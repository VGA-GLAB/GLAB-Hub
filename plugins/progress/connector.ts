// progress モジュールの Calliope コネクタ定義。
//
// 接続契約は spec/interface/calliope-connector.md が正本。
// ここは env → コネクタ設定の写像だけを持ち、 HTTP も DOM も触らない
// (テストから設定の妥当性だけを確かめられるようにする)。

import {
  VersionedHttpServiceConnector,
  type VersionedConnectorOptions,
} from '../service-health-connector.ts';

export const CALLIOPE_CONNECTOR_ID = 'calliope';

/** Calliope 側 `GET /api/glab/progress` (Calliope docs/design/glab-pm.md §H4)。 */
export const CALLIOPE_PROGRESS_PATH = '/api/glab/progress';

/** `/api/*` の認可対象外 (Calliope src/routes/health.ts)。 token 無しでも通る。 */
const CALLIOPE_HEALTH_PATH = '/health';

export type EnvReader = (key: string) => string | undefined;

/**
 * Calliope はログイン中ユーザの Cernere トークンを受け付けない
 * (`apiAuth(config.serviceToken)` = 固定 Bearer 1 本のみ)。 そのため他モジュールの
 * `proxy()` = ユーザ単位ダウンストリームトークン中継には乗せず、 コネクタに固定
 * ヘッダを持たせる。
 */
export function calliopeConnectorOptions(env: EnvReader): VersionedConnectorOptions {
  const token = env('CALLIOPE_SERVICE_TOKEN')?.trim();
  return {
    id: CALLIOPE_CONNECTOR_ID,
    title: 'PM進捗 (Calliope)',
    scope: 'multi',
    // 未設定なら空文字 → コネクタが degraded / 503 を返し、 パネルが「未接続」を出す。
    baseUrl: env('CALLIOPE_BASE_URL')?.trim() ?? '',
    healthPath: CALLIOPE_HEALTH_PATH,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

export function makeCalliopeConnector(env: EnvReader): VersionedHttpServiceConnector {
  return new VersionedHttpServiceConnector(calliopeConnectorOptions(env));
}
