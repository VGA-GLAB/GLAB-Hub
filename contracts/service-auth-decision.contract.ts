import type { ServiceAuthDecision } from '../plugins/projects/service-auth.ts';
import type { ServiceTokenVerification } from '../plugins/projects/service-token-verifier.ts';

const STATUS_BY_VERIFICATION = { insufficient_scope: 403, invalid: 401, unavailable: 503 } as const;

export default {
  /** C-13: service token の照合結果が優先され、 無いときだけ固定トークン照合 (fail-closed)。 */
  post: (
    decision: ServiceAuthDecision,
    provided: string | null,
    expected: string | undefined,
    verification: ServiceTokenVerification | null,
  ): boolean => {
    if (verification) {
      if (verification.status === 'ok') return decision.allow;
      return !decision.allow && decision.status === STATUS_BY_VERIFICATION[verification.status];
    }
    const trimmed = expected?.trim();
    if (!trimmed) return !decision.allow && decision.status === 503;
    if (provided !== null && provided === trimmed) return decision.allow;
    return !decision.allow && decision.status === 401;
  },
};
