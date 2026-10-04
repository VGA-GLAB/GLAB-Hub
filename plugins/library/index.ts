// @implements SPEC-GLAB-LENDING-001
import type { CorpusModule } from '../../corpus/server/hub/sdk.ts';
import { VersionedHttpServiceConnector } from '../service-health-connector.ts';
import { normalizeHttpBaseUrl } from '../shared.ts';
import { libraryRoutes } from './routes.ts';

const library: CorpusModule = {
  id: 'library', title: '本・機材', icon: '📚',
  setup(ctx) {
    const connector = new VersionedHttpServiceConnector({
      id: 'bibliotheca', title: '本・機材 (Bibliotheca)', scope: 'multi',
      baseUrl: normalizeHttpBaseUrl(ctx.env('BIBLIOTHECA_BASE_URL'), 'BIBLIOTHECA_BASE_URL') ?? '',
      healthPath: '/api/health',
    });
    ctx.registerConnector(connector);
    ctx.registerRoute(libraryRoutes(connector, ctx.tokenProvider));
    ctx.registerPanel({ title: '本・機材', icon: '📚' });
    if (!connector.baseUrl) ctx.logger.warn('Bibliotheca connection is not configured');
  },
};
export default library;
