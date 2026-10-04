/**
 * POST /checkin/gps の multipart 本文を読む (契約 G2)。
 *
 * 本文は上限付きでしかメモリへ取り込まない。 位置の範囲・鮮度・EXIF の判定は
 * Aedilis (G3) が持つので、 ここでは形と写真の型・大きさだけを見る。
 */

import { BodyTooLargeError, readBodyWithinLimit } from '../vantan-user/bounded-body.ts';

/** 写真 1 枚の上限 (G2: 10 MB 以下)。 */
export const GPS_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** multipart の境界と 4 つの数値欄に充てる余白。 */
const FORM_OVERHEAD_BYTES = 64 * 1024;
export const GPS_PHOTO_TYPES = new Set(['image/jpeg', 'image/heic']);

export interface GpsCheckinForm {
  lat: string;
  lon: string;
  accuracyM: string;
  positionAt: string;
  positionAtMs: number;
  photo: { bytes: Uint8Array; contentType: string };
}

export type GpsCheckinFormResult =
  | { ok: true; form: GpsCheckinForm }
  | { ok: false; status: 400 | 413; error: 'invalid_input' | 'photo_invalid' };

interface FormSource {
  body: ReadableStream<Uint8Array> | null;
  headers: Headers;
}

export async function readGpsCheckinForm(source: FormSource): Promise<GpsCheckinFormResult> {
  const contentType = source.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    return { ok: false, status: 400, error: 'invalid_input' };
  }
  let raw: ArrayBuffer;
  try {
    raw = await readBodyWithinLimit(source, GPS_PHOTO_MAX_BYTES + FORM_OVERHEAD_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return { ok: false, status: 413, error: 'photo_invalid' };
    return { ok: false, status: 400, error: 'invalid_input' };
  }
  let data: FormData;
  try {
    data = await new Response(raw, { headers: { 'content-type': contentType } }).formData();
  } catch {
    return { ok: false, status: 400, error: 'invalid_input' };
  }

  const fields = ['lat', 'lon', 'accuracyM', 'positionAt'].map((name) => numericField(data, name));
  const [lat, lon, accuracyM, positionAt] = fields;
  if (lat == null || lon == null || accuracyM == null || positionAt == null) {
    return { ok: false, status: 400, error: 'invalid_input' };
  }

  const photo = data.get('photo');
  if (!(photo instanceof Blob) || photo.size === 0) return { ok: false, status: 400, error: 'photo_invalid' };
  if (photo.size > GPS_PHOTO_MAX_BYTES) return { ok: false, status: 413, error: 'photo_invalid' };
  const photoType = photo.type.toLowerCase();
  if (!GPS_PHOTO_TYPES.has(photoType)) return { ok: false, status: 400, error: 'photo_invalid' };

  return {
    ok: true,
    form: {
      lat: lat.text,
      lon: lon.text,
      accuracyM: accuracyM.text,
      positionAt: positionAt.text,
      positionAtMs: positionAt.value,
      photo: { bytes: new Uint8Array(await photo.arrayBuffer()), contentType: photoType },
    },
  };
}

function numericField(data: FormData, name: string): { text: string; value: number } | null {
  const value = data.get(name);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? { text, value: parsed } : null;
}
