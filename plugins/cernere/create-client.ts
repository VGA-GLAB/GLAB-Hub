import type { CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { cernereClientOwner, type CernereProjectApi } from './shared-owner.ts';

export function createCernereProjectClient(ctx: CorpusContext): CernereProjectApi {
  return cernereClientOwner.get({
    projectKey: ctx.env('CORPUS_SERVICE_ID')?.trim() || 'EducationLab',
    cernereBaseUrl: requireEnv(ctx, 'CERNERE_BASE_URL'),
    clientId: requireEnv(ctx, 'CERNERE_PROJECT_CLIENT_ID'),
    clientSecret: requireEnv(ctx, 'CERNERE_PROJECT_CLIENT_SECRET'),
  });
}

function requireEnv(ctx: CorpusContext, key: string): string {
  const value = ctx.env(key)?.trim();
  if (!value) throw new Error(`Required environment variable is missing: ${key}`);
  return value;
}
