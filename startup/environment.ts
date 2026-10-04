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

/** Env that only the Odeum live-presentation feature needs (relay URL + ticket signing key). */
export const ODEUM_ENVIRONMENT = [
  'ODEUM_RELAY_URL', 'GLAB_ODEUM_TICKET_PRIVATE_KEY', 'GLAB_ODEUM_TICKET_KID',
] as const;

export interface OdeumEnvironmentStatus {
  enabled: boolean;
  missing: string[];
}

/**
 * Inspect the Odeum env without stopping the hub. Missing values disable only the
 * odeum plugin; the caller reports the key names (never the values).
 */
export function inspectOdeumEnvironment(env: NodeJS.ProcessEnv): OdeumEnvironmentStatus {
  const missing = ODEUM_ENVIRONMENT.filter((name) => !env[name]?.trim());
  return { enabled: missing.length === 0, missing };
}
