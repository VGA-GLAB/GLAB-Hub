// progress モジュールの Calliope コネクタ定義。
//
// 接続契約は spec/interface/calliope-connector.md が正本。
// ここは env → コネクタ設定の写像だけを持ち、 HTTP も DOM も触らない
// (テストから設定の妥当性だけを確かめられるようにする)。

import {
  VersionedHttpServiceConnector,
  type VersionedConnectorOptions,
} from '../service-health-connector.ts';
import { CernereServiceTokenSource } from '../cernere-service-token.ts';
import { makeSenderCredentialProvider, type SenderCredential } from '../service-credential.ts';
import type { EnvReader } from '../shared.ts';
import { CalliopeServiceConnector } from './service-connector.ts';

export const CALLIOPE_CONNECTOR_ID = 'calliope';

/** Calliope 側 `GET /api/glab/progress` (Calliope docs/design/glab-pm.md §H4)。 */
export const CALLIOPE_PROGRESS_PATH = '/api/glab/progress';

/** `/api/*` の認可対象外 (Calliope src/routes/health.ts)。 token 無しでも通る。 */
const CALLIOPE_HEALTH_PATH = '/health';

/**
 * Calliope はログイン中ユーザの Cernere トークンを受け付けない。 そのため他モジュールの
 * `proxy()` = ユーザ単位ダウンストリームトークン中継には乗せず、 コネクタが machine
 * credential を data request にだけ付ける (`CalliopeServiceConnector`)。
 * ここで返す設定は credential を持たない (health probe には何も付けない)。
 */
export function calliopeConnectorOptions(env: EnvReader): VersionedConnectorOptions {
  return {
    id: CALLIOPE_CONNECTOR_ID,
    title: 'PM進捗 (Calliope)',
    scope: 'multi',
    // 未設定なら空文字 → コネクタが degraded / 503 を返し、 パネルが「未接続」を出す。
    baseUrl: env('CALLIOPE_BASE_URL')?.trim() ?? '',
    healthPath: CALLIOPE_HEALTH_PATH,
    headers: {},
  };
}

/**
 * Calliope `/api/*` 向け credential (認証集約 P4)。 Cernere service token
 * (scope calliope-api:access、 target_project_key = CALLIOPE_PROJECT_KEY) を優先し、
 * 発行に失敗したときだけ従来の CALLIOPE_SERVICE_TOKEN に落とす (P5 で撤去)。
 * Calliope は Cernere 未登録のため project key は env で受け取る。
 */
export function calliopeCredentialProvider(env: EnvReader): () => Promise<SenderCredential> {
  return makeSenderCredentialProvider({
    label: 'calliope',
    source: new CernereServiceTokenSource({
      cernereBaseUrl: env('CERNERE_BASE_URL'),
      clientId: env('CERNERE_PROJECT_CLIENT_ID'),
      clientSecret: env('CERNERE_PROJECT_CLIENT_SECRET'),
      targetProjectKey: env('CALLIOPE_PROJECT_KEY'),
    }),
    legacyToken: env('CALLIOPE_SERVICE_TOKEN'),
  });
}

export function makeCalliopeConnector(env: EnvReader): VersionedHttpServiceConnector {
  return new CalliopeServiceConnector(calliopeConnectorOptions(env), calliopeCredentialProvider(env));
}
