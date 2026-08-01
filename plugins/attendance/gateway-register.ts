import type { SqlDb } from '../data.ts';
import { saveGateway } from '../data.ts';
import type { VersionedHttpServiceConnector } from '../service-health-connector.ts';

interface GatewayKeyResponse {
  lanId?: unknown;
  facilityId?: unknown;
  publicKeyPem?: unknown;
}

// 鍵取得は hub 起動シーケンス上で await されるため、 Os が応答しない (パケットを
// 落とす) 場合に起動全体を止めないよう必ずタイムアウトを課す。
const GATEWAY_KEY_TIMEOUT_MS = 5_000;

/** Os の公開鍵を起動時に取得し、到達不能なら既存キャッシュをそのまま使う。 */
export async function refreshGatewayPublicKey(
  db: SqlDb,
  connector: VersionedHttpServiceConnector,
): Promise<boolean> {
  const response = await connector.fetch('/gateway-public-key', {
    signal: AbortSignal.timeout(GATEWAY_KEY_TIMEOUT_MS),
  });
  if (!response.ok) return false;
  const body = await response.json() as GatewayKeyResponse;
  if (
    typeof body.lanId !== 'string' || !body.lanId.trim() ||
    typeof body.facilityId !== 'string' || !body.facilityId.trim() ||
    typeof body.publicKeyPem !== 'string' || !body.publicKeyPem.trim()
  ) return false;
  saveGateway(db, {
    lanId: body.lanId,
    facilityId: body.facilityId,
    publicKeyPem: body.publicKeyPem,
  });
  return true;
}
