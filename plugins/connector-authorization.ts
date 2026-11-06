import { getUserSession } from '../corpus/server/hub/sdk.ts';
import type { AuthorizedUploadBody, Context, ServiceConnector, TokenProvider } from '../corpus/server/hub/sdk.ts';
import { classifyDownstreamOperation } from './downstream-operations.ts';
import { readUploadResult } from './upload-result.ts';

export const PRIVATE_NO_STORE = 'private, no-store';

/** Authenticated data requests must never fall through to an anonymous endpoint. */
export async function authorizedConnectorFetch(
  c: Context,
  connector: ServiceConnector,
  path: string,
  tokenProvider: TokenProvider,
  projectKey: string,
  init: RequestInit = {},
  upload?: AuthorizedUploadBody,
): Promise<Response> {
  if (!connector.baseUrl.trim()) {
    return unavailable('connector_unconfigured', connector.id);
  }

  let authorized: Awaited<ReturnType<TokenProvider['authorize']>>;
  try {
    const operation = classifyDownstreamOperation(projectKey, init.method ?? 'GET', path);
    if (!operation) return unavailable('downstream_operation_unclassified', connector.id);
    authorized = await tokenProvider.authorize(getUserSession(c), {
      service: connector.id,
      projectKey,
      baseUrl: connector.baseUrl,
    }, { path, init, ...operation, ...(upload ? { upload } : {}) });
  } catch {
    // Issuer errors may contain credentials. Expose only the stable failure code.
    return unavailable('downstream_token_unavailable', connector.id);
  }
  if (!authorized) {
    return unavailable('downstream_token_unavailable', connector.id);
  }

  if (!upload) return connector.fetch(authorized.path, authorized.init);
  if (!authorized.dispose) return unavailable('upload_transfer_unavailable', connector.id);
  try {
    return await readUploadResult(await connector.fetch(authorized.path, authorized.init), authorized.init.signal);
  } catch {
    // The target may have committed. Never retry after an unconfirmed result.
    return Response.json({ error: 'downstream_upload_result_unknown', outcome: 'unknown', connector: connector.id },
      { status: 502, headers: { 'cache-control': PRIVATE_NO_STORE } });
  } finally { await authorized.dispose(); }
}

function unavailable(error: string, connector: string): Response {
  return Response.json(
    { error, connector },
    { status: 503, headers: { 'cache-control': PRIVATE_NO_STORE } },
  );
}
