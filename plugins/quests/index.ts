import type { CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { ensureSchema } from '../data.ts';
import { createQuestRoutes } from './routes.ts';

const module: CorpusModule = {
  id:'quests', title:'クエストボード', icon:'📜',
  setup(ctx) {
    ensureSchema(ctx.db);
    ctx.registerRoute(createQuestRoutes(ctx.db));
    ctx.registerPanel({ title:'クエストボード', icon:'📜' });
  },
};
export default module;
