import type { ServiceTokenResult } from '../plugins/cernere-service-token.ts';
import type { SenderCredential } from '../plugins/service-credential.ts';

export default {
  /** C-16: 発行成功なら必ず service token。 固定トークンは発行失敗時だけ、 どちらも無ければ none。 */
  post: (credential: SenderCredential, issued: ServiceTokenResult, legacyToken: string | undefined): boolean => {
    if (issued.ok) return credential.kind === 'service_token' && credential.token === issued.token;
    const legacy = legacyToken?.trim();
    if (legacy) return credential.kind === 'legacy' && credential.token === legacy && credential.reason === issued.reason;
    return credential.kind === 'none' && credential.reason === issued.reason;
  },
};
