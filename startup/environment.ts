/** Validate Ex injection before opening stores or importing the Corpus runtime. */
export function requireInjectedEnvironment(env: NodeJS.ProcessEnv): void {
  const required = [
    'CERNERE_BASE_URL', 'CERNERE_PROJECT_CLIENT_ID', 'CERNERE_PROJECT_CLIENT_SECRET',
    'CORPUS_PUBLIC_URL', 'CORPUS_TOKEN_MODE', 'GLAB_DATABASE_URL',
  ];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing Excubitor-injected environment: ${missing.join(', ')}`);
  }
}
