/**
 * プロフィール顔写真の中継ルート。
 *
 * GLab は写真を保存せず、Cernere の応答を都度そのまま返す。応答には必ず
 * `Cache-Control: private, no-store` を付け、ブラウザにも中間にも残さない
 * (spec/feature/face-photo-profile.md §1)。
 * 一覧で全員分をまとめて取る口は作らない — 1 件ずつだけ。
 */

import { Hono, getUserToken, requireAdmin } from '../../corpus/server/hub/sdk.ts';
import type { Context, CorpusContext } from '../../corpus/server/hub/sdk.ts';
import {
  FacePhotoClient,
  FacePhotoNotFoundError,
  FacePhotoUnavailableError,
  FacePhotoUpstreamError,
  type FacePhotoBinary,
} from './face-photo-client.ts';
import { BodyTooLargeError, readBodyWithinLimit } from './bounded-body.ts';

class MissingUserTokenError extends Error {}

const NO_STORE = {
  'cache-control': 'private, no-store',
  'x-content-type-options': 'nosniff',
} as const;
/** 表示用に Cernere が保存している写真は長辺 1024 の JPEG。10MB もあれば十分に余る。 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function registerFacePhotoRoutes(router: Hono, ctx: CorpusContext): void {
  /** requireAuth を通っていれば必ず載っている。無いのは配線ミスなので 401 で止める。 */
  const userToken = (c: Context): string => {
    const token = getUserToken(c);
    if (!token) throw new MissingUserTokenError('user token is not available');
    return token;
  };

  const client = new FacePhotoClient({
    baseUrl: ctx.env('CERNERE_BASE_URL') ?? '',
    serviceToken: ctx.env('CERNERE_FACE_PHOTO_TOKEN') ?? '',
  });

  const fail = (c: Context, error: unknown) => {
    if (error instanceof MissingUserTokenError) return c.json({ error: 'unauthorized' }, 401, NO_STORE);
    if (error instanceof FacePhotoNotFoundError) return c.json({ error: 'not_found' }, 404, NO_STORE);
    if (error instanceof BodyTooLargeError) return c.json({ error: 'image_too_large' }, 413, NO_STORE);
    if (error instanceof FacePhotoUnavailableError) {
      ctx.logger.error(`face photo service token is not configured`);
      return c.json({ error: 'face_photo_unavailable' }, 503, NO_STORE);
    }
    if (error instanceof FacePhotoUpstreamError) {
      // 上流本文は個人情報や内部診断を含み得るので、状態コードだけを記録・分類する。
      ctx.logger.error(`face photo upstream failed with status ${error.status}`);
      if (error.status === 409) return c.json({ error: 'consent_required' }, 409, NO_STORE);
      if (error.status === 413) return c.json({ error: 'image_too_large' }, 413, NO_STORE);
      if (error.status === 422) return c.json({ error: 'image_rejected' }, 422, NO_STORE);
      return c.json({ error: 'cernere_upstream_error' }, 502, NO_STORE);
    }
    ctx.logger.error('face photo relay failed');
    return c.json({ error: 'cernere_unavailable' }, 503, NO_STORE);
  };

  const binary = (c: Context, photo: FacePhotoBinary) =>
    c.body(photo.bytes, 200, { ...NO_STORE, 'content-type': photo.contentType });

  // ── 生徒本人 ───────────────────────────────────────────

  /** 同意文面。版名と requiredFor を含めて Cernere が返すものをそのまま出す。 */
  router.get('/face-photo/policy', async (c) => {
    try {
      return c.json(await client.consentPolicy(userToken(c)) as object, 200, NO_STORE);
    } catch (error) { return fail(c, error); }
  });

  router.post('/face-photo/consent', async (c) => {
    const body = await c.req.json().catch(() => null) as { policyVersion?: unknown; facilityId?: unknown } | null;
    const policyVersion = typeof body?.policyVersion === 'string' ? body.policyVersion.trim() : '';
    const facilityId = typeof body?.facilityId === 'string' ? body.facilityId.trim() : '';
    if (!policyVersion || !facilityId) return c.json({ error: 'invalid_consent' }, 400, NO_STORE);
    try {
      return c.json(await client.recordConsent(userToken(c), policyVersion, facilityId) as object, 200, NO_STORE);
    } catch (error) { return fail(c, error); }
  });

  router.get('/face-photo/status', async (c) => {
    try {
      return c.json(await client.templateStatus(userToken(c)) as object, 200, NO_STORE);
    } catch (error) { return fail(c, error); }
  });

  router.post('/face-photo', async (c) => {
    const facilityId = c.req.query('facilityId')?.trim() ?? '';
    if (!facilityId) return c.json({ error: 'facility_required' }, 400, NO_STORE);
    const contentType = c.req.header('content-type') ?? '';
    const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'multipart/form-data') {
      return c.json({ error: 'multipart_required' }, 400, NO_STORE);
    }
    try {
      const token = userToken(c);
      const body = await readBodyWithinLimit(c.req.raw, MAX_UPLOAD_BYTES);
      return c.json(await client.upload(token, facilityId, body, contentType) as object, 201, NO_STORE);
    } catch (error) { return fail(c, error); }
  });

  router.get('/face-photo/me', async (c) => {
    try {
      return binary(c, await client.readOwn(userToken(c)));
    } catch (error) { return fail(c, error); }
  });

  router.delete('/face-photo', async (c) => {
    try {
      return c.json(await client.deleteOwn(userToken(c)) as object, 200, NO_STORE);
    } catch (error) { return fail(c, error); }
  });

  // ── 職員 (名簿・出席確認画面) ────────────────────────────

  /** 1 件ずつのみ。名簿一覧から全員分を引く口は作らない。 */
  router.get('/face-photo/user/:userId', requireAdmin, async (c) => {
    const userId = c.req.param('userId');
    if (!userId) return c.json({ error: 'user_required' }, 400, NO_STORE);
    try {
      const photo = await client.readAsStaff(userId);
      // 閲覧者・対象者 ID は顔写真アクセス履歴そのものになるためログへ残さない。
      ctx.logger.info('face photo viewed by an authorized administrator');
      return binary(c, photo);
    } catch (error) { return fail(c, error); }
  });
}
