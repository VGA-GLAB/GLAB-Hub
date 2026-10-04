import type { GpsCheckinFormResult } from '../plugins/attendance/gps-checkin-form.ts';
import { GPS_PHOTO_MAX_BYTES, GPS_PHOTO_TYPES } from '../plugins/attendance/gps-checkin-form.ts';

export default {
  /** C-8: 受理は jpeg/heic で 10 MB 以下の写真だけ。 拒否は契約語彙 (413 は photo_invalid のみ)。 */
  post: (result: GpsCheckinFormResult): boolean => {
    if (result.ok) {
      const { photo } = result.form;
      return GPS_PHOTO_TYPES.has(photo.contentType) && photo.bytes.byteLength > 0
        && photo.bytes.byteLength <= GPS_PHOTO_MAX_BYTES && Number.isFinite(result.form.positionAtMs);
    }
    if (result.status === 413) return result.error === 'photo_invalid';
    return result.status === 400 && (result.error === 'invalid_input' || result.error === 'photo_invalid');
  },
};
