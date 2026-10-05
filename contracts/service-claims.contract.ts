import type { ServiceClaimsDecision } from '../plugins/projects/service-token-verifier.ts';

export default {
  /** C-12: ok は kind=service・aud 一致・exp 未到来・scope 包含のときだけ。 */
  post: (
    decision: ServiceClaimsDecision,
    claims: Record<string, unknown>,
    audience: string,
    requiredScope: string,
    nowMs: number,
  ): boolean => {
    const exp = typeof claims.exp === 'string' ? Date.parse(claims.exp) : NaN;
    const wellFormed = claims.kind === 'service' && typeof claims.sub === 'string' && claims.sub !== ''
      && Array.isArray(claims.scope) && claims.scope.every((s) => typeof s === 'string')
      && audience !== '' && claims.aud === audience && Number.isFinite(exp) && exp > nowMs;
    if (decision === 'ok') return wellFormed && (claims.scope as string[]).includes(requiredScope);
    if (decision === 'insufficient_scope') return wellFormed && !(claims.scope as string[]).includes(requiredScope);
    return decision === 'invalid';
  },
};
