import {
  Hono,
  HttpServiceConnector,
  getIdentity,
} from '../../corpus/server/hub/sdk.ts';
import type {
  Context,
  CorpusContext,
  CorpusModule,
  ServiceConnector,
} from '../../corpus/server/hub/sdk.ts';
import { proxy } from '../shared.ts';

type RelationType = 'desired' | 'offer';

function relationType(value: string): RelationType | null {
  return value === 'desired' || value === 'offer' ? value : null;
}

async function proxyUserCompanies(
  c: Context,
  connector: ServiceConnector,
  path: string,
): Promise<Response> {
  const identity = getIdentity(c);
  const headers: Record<string, string> = {
    'X-Cernere-User-Id': identity.userId,
  };
  const init: RequestInit = { method: c.req.method, headers };
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && c.req.method !== 'DELETE') {
    headers['content-type'] = c.req.header('content-type') ?? 'application/json';
    init.body = await c.req.text();
  }

  try {
    const response = await connector.fetch(path, init);
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (error) {
    return c.json({ error: 'tirocinium_unavailable', detail: String(error) }, 503);
  }
}

const tirociniumModule: CorpusModule = {
  id: 'tirocinium',
  title: '企業',
  icon: '🏢',
  setup(ctx: CorpusContext) {
    const tirocinium = new HttpServiceConnector({
      id: 'tirocinium',
      title: '企業・就活 (Tirocinium)',
      scope: 'multi',
      baseUrl: ctx.env('TIROCINIUM_URL') ?? '',
      healthPath: '/health',
    });
    ctx.registerConnector(tirocinium);

    const routes = new Hono();
    routes.get('/companies', (c) => proxy(c, tirocinium, '/api/v1/companies'));
    routes.get('/career-companies', (c) => proxyUserCompanies(
      c,
      tirocinium,
      '/api/integrations/glab/career-companies',
    ));
    routes.put('/career-companies/:relationType/:companyId', (c) => {
      const type = relationType(c.req.param('relationType'));
      if (!type) return c.json({ error: 'invalid_relation_type' }, 400);
      return proxyUserCompanies(
        c,
        tirocinium,
        `/api/integrations/glab/career-companies/${type}/${encodeURIComponent(c.req.param('companyId'))}`,
      );
    });
    routes.delete('/career-companies/:relationType/:companyId', (c) => {
      const type = relationType(c.req.param('relationType'));
      if (!type) return c.json({ error: 'invalid_relation_type' }, 400);
      return proxyUserCompanies(
        c,
        tirocinium,
        `/api/integrations/glab/career-companies/${type}/${encodeURIComponent(c.req.param('companyId'))}`,
      );
    });
    ctx.registerRoute(routes);
    ctx.registerPanel({ title: '企業', icon: '🏢' });
    ctx.logger.info(
      `career companies → Tirocinium (${ctx.env('TIROCINIUM_URL') || '未設定 = degraded'})`,
    );
  },
};

export default tirociniumModule;
