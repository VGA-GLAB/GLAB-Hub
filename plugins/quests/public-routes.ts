import { Hono } from '../../corpus/server/hub/sdk.ts';
import type { CorpusDb } from '../../corpus/server/hub/sdk.ts';
import { listPublicQuests } from './store.ts';
import { renderQuestBoard } from './public-page.ts';

export function createPublicQuestRoutes(db: CorpusDb): Hono {
  const router=new Hono();
  router.get('/quests', c => {
    c.header('Cache-Control','no-store');
    c.header('Referrer-Policy','no-referrer');
    c.header('X-Content-Type-Options','nosniff');
    c.header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'");
    return c.html(renderQuestBoard(listPublicQuests(db), c.req.query('embed')==='1'));
  });
  return router;
}
