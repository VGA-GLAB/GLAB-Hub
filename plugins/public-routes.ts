import { Hono, type CorpusDb } from '../corpus/server/hub/sdk.ts';
import { createPublicLegalRoutes } from './legal/public-routes.ts';
import { createPublicQuestRoutes } from './quests/public-routes.ts';

/** @implements SPEC-GLAB-PUBLIC-LEGAL-001 */
export function createGlabPublicRoutes(db: CorpusDb, legalDirectory: string): Hono {
  const router = new Hono();
  router.route('/', createPublicLegalRoutes(legalDirectory));
  router.route('/', createPublicQuestRoutes(db));
  return router;
}
