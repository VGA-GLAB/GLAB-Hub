import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  FacePhotoClient,
  FacePhotoNotFoundError,
  FacePhotoUnavailableError,
  FacePhotoUpstreamError,
} from '../plugins/vantan-user/face-photo-client.ts';

interface Call { url: string; init: RequestInit }

function stub(responses: Response[]): { calls: Call[]; fetchImpl: typeof fetch } {
  const calls: Call[] = [];
  const queue = [...responses];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return queue.shift() ?? new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test('職員の写真取得は tool token 未設定なら取りに行かず fail closed', async () => {
  const { calls, fetchImpl } = stub([]);
  const client = new FacePhotoClient({ baseUrl: 'http://cernere', fetchImpl });
  await assert.rejects(() => client.readAsStaff('user-1'), FacePhotoUnavailableError);
  assert.equal(calls.length, 0, 'Cernere へ問い合わせない');
});

test('職員の写真取得は 1 人分の URL だけを叩く', async () => {
  const { calls, fetchImpl } = stub([
    new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } }),
  ]);
  const client = new FacePhotoClient({ baseUrl: 'http://cernere/', serviceToken: 'tool-token', fetchImpl });
  const photo = await client.readAsStaff('user-1');
  assert.equal(photo.contentType, 'image/jpeg');
  assert.equal(calls[0]?.url, 'http://cernere/api/identity/face-photo/user-1');
  assert.equal((calls[0]?.init.headers as Record<string, string>).authorization, 'Bearer tool-token');
});

test('写真が無い生徒は not found として扱う (バッジ表示に落とす)', async () => {
  const { fetchImpl } = stub([new Response('', { status: 404 })]);
  const client = new FacePhotoClient({ baseUrl: 'http://cernere', serviceToken: 't', fetchImpl });
  await assert.rejects(() => client.readAsStaff('user-1'), FacePhotoNotFoundError);
});

test('同意が無い写真アップロードは 409 を保ちつつ上流本文を例外へ含めない', async () => {
  const { fetchImpl } = stub([
    new Response(JSON.stringify({ error: 'consent_required' }), { status: 409 }),
  ]);
  const client = new FacePhotoClient({ baseUrl: 'http://cernere', fetchImpl });
  await assert.rejects(
    () => client.upload('user-token', 'fac-1', new ArrayBuffer(8), 'multipart/form-data; boundary=x'),
    (error: unknown) => error instanceof FacePhotoUpstreamError
      && error.status === 409 && !error.message.includes('consent_required'),
  );
});

test('写真取得は JPEG 以外を同一オリジンへ中継しない', async () => {
  const { fetchImpl } = stub([
    new Response('<script>bad()</script>', { status: 200, headers: { 'content-type': 'text/html' } }),
  ]);
  const client = new FacePhotoClient({ baseUrl: 'http://cernere', serviceToken: 't', fetchImpl });
  await assert.rejects(
    () => client.readAsStaff('user-1'),
    (error: unknown) => error instanceof FacePhotoUpstreamError && error.status === 502,
  );
});

test('上流写真が上限を超える場合は本文を読み込まず失敗する', async () => {
  const { fetchImpl } = stub([
    new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(11 * 1024 * 1024) },
    }),
  ]);
  const client = new FacePhotoClient({ baseUrl: 'http://cernere', serviceToken: 't', fetchImpl });
  await assert.rejects(
    () => client.readAsStaff('user-1'),
    (error: unknown) => error instanceof FacePhotoUpstreamError && error.status === 502,
  );
});

test('本人の操作は本人 token を使う', async () => {
  const { calls, fetchImpl } = stub([new Response('{}', { status: 200 })]);
  const client = new FacePhotoClient({ baseUrl: 'http://cernere', serviceToken: 'tool', fetchImpl });
  await client.deleteOwn('student-token');
  assert.equal((calls[0]?.init.headers as Record<string, string>).authorization, 'Bearer student-token');
  assert.equal(calls[0]?.url, 'http://cernere/api/identity/face-photo');
  assert.equal(calls[0]?.init.redirect, 'error');
});
