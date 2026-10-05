import { VersionedHttpServiceConnector, type VersionedConnectorOptions } from '../service-health-connector.ts';
import type { SenderCredential } from '../service-credential.ts';

/**
 * Calliope の machine credential の適用境界。公開 health probe に credential を送らない。
 * credential はリクエストごとに provider から取る (Cernere service token は 15 分で失効し、
 * 発行失敗時だけ固定トークンに落ちる — 認証集約 P4)。
 */
export class CalliopeServiceConnector extends VersionedHttpServiceConnector {
  private readonly credential: () => Promise<SenderCredential>;

  constructor(options: VersionedConnectorOptions, credential: () => Promise<SenderCredential>) {
    super({ ...options, headers: {} });
    this.credential = credential;
  }

  override async fetch(path: string, init?: RequestInit): Promise<Response> {
    if (!this.baseUrl) return super.fetch(path, init);
    const credential = await this.credential();
    if (credential.kind === 'none') {
      return Response.json(
        { error: 'service_token_unavailable', connector: this.id },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }
    const headers = new Headers(init?.headers);
    headers.set('authorization', `Bearer ${credential.token}`);
    return super.fetch(path, { ...init, headers });
  }
}
