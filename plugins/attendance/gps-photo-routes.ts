/**
 * GET /gps-photos/:attendanceId — GPS チェックイン写真の閲覧 (契約 G2)。
 *
 * GLAB にログインした利用者だけが見られる。 直リンクでも利用者 token が無ければ
 * 401 で、 応答は private, no-store (ブラウザにも中間にも残さない)。
 */

import { getUserToken } from '../../corpus/server/hub/sdk.ts';
import type { Context, Hono } from '../../corpus/server/hub/sdk.ts';
import { getGpsPhoto, type SqlDb } from '../data.ts';
import type { GpsPhotoFileStore } from './gps-photo-files.ts';

const NO_STORE = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
} as const;

export function registerGpsPhotoRoutes(
  router: Hono,
  deps: { db: SqlDb; photos: GpsPhotoFileStore; logger: { error(message: string): void } },
): void {
  router.get('/gps-photos/:attendanceId', async (c: Context) => {
    if (!getUserToken(c)) return c.json({ error: 'unauthorized' }, 401, NO_STORE);
    const row = getGpsPhoto(deps.db, c.req.param('attendanceId') ?? '');
    if (!row) return c.json({ error: 'not_found' }, 404, NO_STORE);
    let bytes: Uint8Array | null;
    try {
      bytes = await deps.photos.read(row.sha256);
    } catch {
      deps.logger.error('gps photo could not be read');
      return c.json({ error: 'photo_unavailable' }, 503, NO_STORE);
    }
    if (!bytes) return c.json({ error: 'not_found' }, 404, NO_STORE);
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return c.body(body, 200, { ...NO_STORE, 'content-type': row.content_type });
  });
}
