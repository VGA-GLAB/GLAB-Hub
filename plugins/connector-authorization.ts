import { getUserToken } from '../corpus/server/hub/sdk.ts';
import type { Context, ServiceConnector, TokenProvider } from '../corpus/server/hub/sdk.ts';

export const PRIVATE_NO_STORE = 'private, no-store';

/** Authenticated data requests must never fall through to an anonymous endpoint. */
export async function authorizedConnectorFetch(
  c: Context,
  connector: ServiceConnector,
  path: string,
  tokenProvider: TokenProvider,
  projectKey = connector.id,
  init: RequestInit = {},
): Promise<Response> {
  if (!connector.baseUrl.trim()) {
    return unavailable('connector_unconfigured', connector.id);
  }

  let token: string | null;
  try {
    token = await tokenProvider.getDownstreamToken(getUserToken(c), {
      service: connector.id,
      projectKey,
      baseUrl: connector.baseUrl,
    });
  } catch {
    // Issuer errors may contain credentials. Expose only the stable failure code.
    return unavailable('downstream_token_unavailable', connector.id);
  }
  if (!token?.trim()) {
    return unavailable('downstream_token_unavailable', connector.id);
  }

  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return connector.fetch(path, { ...init, headers });
}

function unavailable(error: string, connector: string): Response {
  return Response.json(
    { error, connector },
    { status: 503, headers: { 'cache-control': PRIVATE_NO_STORE } },
  );
}
