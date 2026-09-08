import { VersionedHttpServiceConnector, type VersionedConnectorOptions } from '../service-health-connector.ts';

/** 固定 credential の適用境界。公開 health probe に credential を送らない。 */
export class CalliopeServiceConnector extends VersionedHttpServiceConnector {
  private readonly authorization: string | undefined;

  constructor(options: VersionedConnectorOptions) {
    super({ ...options, headers: {} });
    this.authorization = options.headers?.authorization;
  }

  override async fetch(path: string, init?: RequestInit): Promise<Response> {
    if (!this.authorization) {
      return Response.json(
        { error: 'service_token_unavailable', connector: this.id },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }
    const headers = new Headers(init?.headers);
    headers.set('authorization', this.authorization);
    return super.fetch(path, { ...init, headers });
  }
}
