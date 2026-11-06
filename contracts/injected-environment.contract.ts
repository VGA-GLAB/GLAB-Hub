import { DelegationAudiences } from '../corpus/server/hub/delegation-audiences.ts';

const required = [
  'CERNERE_BASE_URL', 'CERNERE_FRONTEND_URL', 'CERNERE_PROJECT_KEY', 'CERNERE_PROJECT_CLIENT_ID', 'CERNERE_PROJECT_CLIENT_SECRET',
  'CORPUS_PUBLIC_URL', 'CORPUS_TOKEN_MODE', 'CORPUS_DELEGATION_AUDIENCES', 'GLAB_DATABASE_URL',
];

export default {
  post: (_result: void, env: NodeJS.ProcessEnv): boolean => {
    if (!required.every((key) => Boolean(env[key]?.trim()))) return false;
    try { new DelegationAudiences(env.CORPUS_DELEGATION_AUDIENCES); return true; }
    catch { return false; /* The postcondition rejects malformed administrator configuration. */ }
  },
  postThrow: (error: unknown, env: NodeJS.ProcessEnv): boolean => {
    const missing = required.filter((key) => !env[key]?.trim());
    if (!(error instanceof Error)) return false;
    if (missing.length) return error.message === `Missing Excubitor-injected environment: ${missing.join(', ')}`;
    try { new DelegationAudiences(env.CORPUS_DELEGATION_AUDIENCES); return false; }
    catch (expected) { return expected instanceof Error && error.message === expected.message; }
  },
};
