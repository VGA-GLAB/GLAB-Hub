const required = [
  'CERNERE_BASE_URL', 'CERNERE_PROJECT_CLIENT_ID', 'CERNERE_PROJECT_CLIENT_SECRET',
  'CORPUS_PUBLIC_URL', 'CORPUS_TOKEN_MODE', 'GLAB_DATABASE_URL',
];

export default {
  post: (_result: void, env: NodeJS.ProcessEnv): boolean =>
    required.every((key) => Boolean(env[key]?.trim())),
  postThrow: (error: unknown, env: NodeJS.ProcessEnv): boolean => {
    const missing = required.filter((key) => !env[key]?.trim());
    return missing.length > 0 && error instanceof Error &&
      error.message === `Missing Excubitor-injected environment: ${missing.join(', ')}`;
  },
};
