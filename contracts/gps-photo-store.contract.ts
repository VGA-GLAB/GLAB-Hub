import type { NewGpsPhoto, SqlDb } from '../plugins/data.ts';
import { getGpsPhoto } from '../plugins/data.ts';

export default {
  /** C-10: 写真は attendanceId に一度だけ結び付く。 書けた・既存のどちらでも行は 1 件で sha256 を持つ。 */
  post: (_result: boolean, db: SqlDb, photo: NewGpsPhoto): boolean => {
    const row = getGpsPhoto(db, photo.attendanceId);
    return row != null && /^[0-9a-f]{64}$/.test(row.sha256);
  },
};
