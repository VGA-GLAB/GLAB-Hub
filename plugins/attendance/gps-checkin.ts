/**
 * POST /checkin/gps — スマホの GPS + 写真チェックインを Aedilis へ中継する (契約 G2/G3)。
 *
 * 1. 利用者の token が無ければ 401 (未認証の送信は上流へ流さない)
 * 2. multipart を上限付きで読む (写真 10 MB、型は image/jpeg | image/heic)
 * 3. Ostiarius の health probe で得た最新 locationStatement を添える。 無ければ 503
 * 4. 利用者の token のまま Aedilis /api/checkin/gps へ中継し、 エラーコードは透過する
 * 5. Aedilis が 200 を返したときだけ写真を保存し、 attendanceId に結び付ける
 *
 * 写真のバイト列・位置はログに出さない (状態コードと固定語彙だけを記録する)。
 */

import { getIdentity, getUserToken } from '../../corpus/server/hub/sdk.ts';
import type { AuthIdentity, Context, ServiceConnector, TokenProvider } from '../../corpus/server/hub/sdk.ts';
import {
  dateInJst,
  findAttendanceId,
  recordAttendance,
  saveGpsPhoto,
  type SqlDb,
} from '../data.ts';
import { authorizedConnectorFetch, PRIVATE_NO_STORE } from '../connector-authorization.ts';
import { readGpsCheckinForm, type GpsCheckinForm } from './gps-checkin-form.ts';
import { sha256Hex, type GpsPhotoFileStore } from './gps-photo-files.ts';
import { locationStatementFromHealth, readLocationStatementClaims } from './location-statement.ts';

export const AEDILIS_GPS_CHECKIN_PATH = '/api/checkin/gps';

/** Aedilis が返す固定語彙 (G3)。 これ以外は上流異常として扱う。 */
export const GPS_CHECKIN_ERROR_CODES = new Set([
  'invalid_input', 'statement_invalid', 'unknown_gateway', 'facility_mismatch', 'statement_stale',
  'accuracy_too_low', 'out_of_range', 'photo_invalid', 'exif_missing', 'exif_time_out_of_window',
  'exif_location_out_of_range', 'photo_reused', 'rate_limited',
]);

/** authorizedConnectorFetch が上流へ届く前に返す 503 の語彙。 */
const CONNECTOR_UNAVAILABLE_CODES = new Set(['connector_unconfigured', 'downstream_token_unavailable']);

const NO_STORE = { 'cache-control': PRIVATE_NO_STORE } as const;

export interface GpsCheckinDeps {
  db: SqlDb;
  ostiarius: { probe(): Promise<{ payload: unknown }> };
  aedilis: ServiceConnector;
  tokenProvider: TokenProvider;
  photos: GpsPhotoFileStore;
  logger: { error(message: string): void };
  /** 進行中で閲覧可能なイベントの id。 引けなければ null (出席は成立させる)。 */
  activeEventId?: (identity: AuthIdentity) => Promise<number | null>;
  now?: () => number;
}

export async function handleGpsCheckin(c: Context, deps: GpsCheckinDeps): Promise<Response> {
  if (!getUserToken(c)) return c.json({ error: 'unauthorized' }, 401, NO_STORE);
  const identity = getIdentity(c);

  const parsed = await readGpsCheckinForm(c.req.raw);
  if (!parsed.ok) return c.json({ error: parsed.error }, parsed.status, NO_STORE);

  const probe = await deps.ostiarius.probe();
  const locationStatement = locationStatementFromHealth(probe.payload);
  if (!locationStatement) {
    return c.json({ error: 'location_statement_unavailable' }, 503, NO_STORE);
  }

  let upstream: Response;
  try {
    upstream = await authorizedConnectorFetch(
      c, deps.aedilis, AEDILIS_GPS_CHECKIN_PATH, deps.tokenProvider, deps.aedilis.id,
      { method: 'POST', body: aedilisForm(locationStatement, parsed.form) },
    );
  } catch {
    deps.logger.error('gps checkin relay to aedilis failed');
    return c.json({ error: 'aedilis_unavailable' }, 503, NO_STORE);
  }

  const body = await upstream.json().catch(() => null) as Record<string, unknown> | null;
  if (!upstream.ok) return relayFailure(c, deps, upstream.status, body);

  const attendanceId = typeof body?.attendanceId === 'string' ? body.attendanceId.trim() : '';
  if (body?.ok !== true || !attendanceId) {
    deps.logger.error('gps checkin: aedilis returned 200 without attendanceId');
    return c.json({ error: 'aedilis_upstream_error' }, 502, NO_STORE);
  }

  const now = (deps.now ?? Date.now)();
  const ledger = await recordLedger(deps, identity, locationStatement, now);
  const photoStored = await storePhoto(deps, {
    attendanceId,
    ledgerId: ledger.ledgerId,
    userId: identity.userId,
    capturedAt: parsed.form.positionAtMs,
    now,
    photo: parsed.form.photo,
  });
  return c.json({
    ok: true,
    attendanceId,
    alreadyCheckedIn: ledger.alreadyCheckedIn,
    photoStored,
  }, 200, NO_STORE);
}

function aedilisForm(locationStatement: string, form: GpsCheckinForm): FormData {
  const data = new FormData();
  data.set('locationStatement', locationStatement);
  data.set('lat', form.lat);
  data.set('lon', form.lon);
  data.set('accuracyM', form.accuracyM);
  data.set('positionAt', form.positionAt);
  data.set('photo', new Blob([form.photo.bytes], { type: form.photo.contentType }), 'photo');
  return data;
}

/** 固定語彙のエラーは状態コードごと透過し、 それ以外は上流異常へ丸める。 */
function relayFailure(
  c: Context,
  deps: GpsCheckinDeps,
  status: number,
  body: Record<string, unknown> | null,
): Response {
  const code = typeof body?.error === 'string' ? body.error : '';
  if (status >= 400 && status < 500 && GPS_CHECKIN_ERROR_CODES.has(code)) {
    return c.json({ error: code }, status as 400, NO_STORE);
  }
  if (status === 503 && CONNECTOR_UNAVAILABLE_CODES.has(code)) {
    return c.json({ error: code }, 503, NO_STORE);
  }
  deps.logger.error(`gps checkin: aedilis responded with status ${status}`);
  return c.json({ error: 'aedilis_upstream_error' }, 502, NO_STORE);
}

/** GLAB の台帳 (出席の正本) へ method=gps / assurance=low で記録する。 */
async function recordLedger(
  deps: GpsCheckinDeps,
  identity: AuthIdentity,
  locationStatement: string,
  now: number,
): Promise<{ ledgerId: string | null; alreadyCheckedIn: boolean }> {
  const claims = readLocationStatementClaims(locationStatement);
  if (!claims) {
    deps.logger.error('gps checkin: location statement payload is unreadable; ledger row skipped');
    return { ledgerId: null, alreadyCheckedIn: false };
  }
  const date = dateInJst(now);
  const eventId = await (deps.activeEventId?.(identity) ?? Promise.resolve(null)).catch(() => null);
  const created = recordAttendance(deps.db, {
    userId: identity.userId,
    date,
    facilityId: claims.facilityId,
    checkedInAt: now,
    source: 'gps',
    assurance: 'low',
    eventId,
    detail: { lanId: claims.lanId },
  });
  return {
    ledgerId: findAttendanceId(deps.db, identity.userId, date, claims.facilityId),
    alreadyCheckedIn: !created,
  };
}

async function storePhoto(deps: GpsCheckinDeps, input: {
  attendanceId: string;
  ledgerId: string | null;
  userId: string;
  capturedAt: number;
  now: number;
  photo: GpsCheckinForm['photo'];
}): Promise<boolean> {
  const sha256 = sha256Hex(input.photo.bytes);
  try {
    await deps.photos.write(sha256, input.photo.bytes);
    saveGpsPhoto(deps.db, {
      attendanceId: input.attendanceId,
      ledgerId: input.ledgerId,
      userId: input.userId,
      capturedAt: input.capturedAt,
      sha256,
      contentType: input.photo.contentType,
      byteSize: input.photo.bytes.byteLength,
      storedAt: input.now,
    });
    return true;
  } catch {
    // 出席は Aedilis で成立済み。 写真の保存失敗で 500 にせず、 失敗だけを記録する。
    deps.logger.error('gps checkin: photo could not be stored');
    return false;
  }
}
