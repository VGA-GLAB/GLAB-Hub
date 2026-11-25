import { Hono, type CorpusDb } from '../corpus/server/hub/sdk.ts';
import { createClientInstallRoutes } from './client/install-routes.ts';
import { createPublicLegalRoutes } from './legal/public-routes.ts';
import { createPublicQuestRoutes } from './quests/public-routes.ts';

/** @implements SPEC-GLAB-PUBLIC-LEGAL-001 */
export function createGlabPublicRoutes(db: CorpusDb, legalDirectory: string, clientDirectory: string): Hono {
  const router = new Hono();
  router.route('/', createClientInstallRoutes(clientDirectory));
  router.route('/', createPublicLegalRoutes(legalDirectory));
  router.route('/', createPublicQuestRoutes(db));
  return router;
}
