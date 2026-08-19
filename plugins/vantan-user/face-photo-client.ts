/**
 * Cernere の顔写真 API への中継クライアント。
 *
 * 認証は 2 系統に分かれる (Cernere/server/src/http/face-photo-handler.ts):
 *   - 生徒本人の操作 (同意・アップロード・自分の写真・削除) … 本人の access token
 *   - 職員の名簿表示 (他人の写真取得)                     … face-photo:read scope を
 *     持つ tool client token。Cernere は project token を明示的に拒否するため、
 *     GLab の既存 project 資格情報では写真を引けない (service-scope-auth.ts)。
 *
 * **GLab は写真を保存しない。** ここでは常に Cernere から都度取得したバイト列を
 * そのまま呼び出し元へ返し、ディスクにもキャッシュにも置かない。
 */

import { BodyTooLargeError, discardBody, readBodyWithinLimit } from './bounded-body.ts';

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export interface FacePhotoClientOptions {
  baseUrl: string;
  /** 職員の名簿表示に使う tool client token。未設定なら他人の写真は引けない。 */
  serviceToken?: string;
  fetchImpl?: typeof fetch;
}

export interface FacePhotoBinary {
  bytes: ArrayBuffer;
  contentType: string;
}

export class FacePhotoUnavailableError extends Error {}
export class FacePhotoNotFoundError extends Error {}
export class FacePhotoUpstreamError extends Error {
  constructor(readonly status: number) {
    super(`Cernere face photo request failed with status ${status}`);
  }
}

export class FacePhotoClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: FacePhotoClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.serviceToken = options.serviceToken?.trim() ?? '';
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** 同意文面 (版付き)。GLab に文面をハードコードしないため毎回 Cernere から引く。 */
  async consentPolicy(userToken: string): Promise<unknown> {
    return this.json('GET', '/api/identity/face-consent/policy', userToken);
  }

  async recordConsent(userToken: string, policyVersion: string, facilityId: string): Promise<unknown> {
    return this.json('POST', '/api/identity/face-consent', userToken, { policyVersion, facilityId });
  }

  async templateStatus(userToken: string): Promise<unknown> {
    return this.json('GET', '/api/identity/face-template/status', userToken);
  }

  /** 本人の写真アップロード。multipart は組み立て直さず、受け取った body をそのまま流す。 */
  async upload(
    userToken: string,
    facilityId: string,
    body: ArrayBuffer,
    contentType: string,
  ): Promise<unknown> {
    const url = `${this.baseUrl}/api/identity/face-photo?facilityId=${encodeURIComponent(facilityId)}`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${userToken}`, 'content-type': contentType },
      body,
    });
    return this.decode(response);
  }

  async readOwn(userToken: string): Promise<FacePhotoBinary> {
    return this.binary('/api/identity/face-photo/me', userToken);
  }

  async deleteOwn(userToken: string): Promise<unknown> {
    return this.json('DELETE', '/api/identity/face-photo', userToken);
  }

  /**
   * 職員が名簿で 1 人分だけ引く。一括取得の口は作らない
   * (spec/feature/face-photo-profile.md §1)。
   */
  async readAsStaff(userId: string): Promise<FacePhotoBinary> {
    if (!this.serviceToken) {
      throw new FacePhotoUnavailableError('face photo service token is not configured');
    }
    return this.binary(`/api/identity/face-photo/${encodeURIComponent(userId)}`, this.serviceToken);
  }

  private async binary(path: string, token: string): Promise<FacePhotoBinary> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      redirect: 'error',
      headers: { authorization: `Bearer ${token}` },
    });
    if (response.status === 404) {
      await discardBody(response);
      throw new FacePhotoNotFoundError('face photo is not registered');
    }
    if (!response.ok) {
      await discardBody(response);
      throw new FacePhotoUpstreamError(response.status);
    }
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'image/jpeg') {
      await discardBody(response);
      throw new FacePhotoUpstreamError(502);
    }
    try {
      return {
        bytes: await readBodyWithinLimit(response, MAX_PHOTO_BYTES),
        contentType,
      };
    } catch (error) {
      if (error instanceof BodyTooLargeError) throw new FacePhotoUpstreamError(502);
      throw error;
    }
  }

  private async json(
    method: string,
    path: string,
    token: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      redirect: 'error',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return this.decode(response);
  }

  private async decode(response: Response): Promise<unknown> {
    if (!response.ok) {
      await discardBody(response);
      throw new FacePhotoUpstreamError(response.status);
    }
    const text = await response.text();
    return text ? JSON.parse(text) as unknown : null;
  }
}
