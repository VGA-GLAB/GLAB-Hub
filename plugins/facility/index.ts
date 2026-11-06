// Authenticated GLab facilities and meeting scheduling through Aedilis.
// @implements SPEC-GLAB-BOOKING-001

import { Hono, getUserSession } from '../../corpus/server/hub/sdk.ts';
import type { CorpusModule, CorpusContext, Context } from '../../corpus/server/hub/sdk.ts';
import { ensureSchema } from '../data.ts';
import { bookingGroups, bookingProxy } from './booking-proxy.ts';
import { registerMeetRoutes } from './meet-routes.ts';
import { finalizeMeetingEvent } from './meeting-event.ts';
import { aedilisBaseUrl, makeAedilisConnector, proxy } from '../shared.ts';
import { AEDILIS_GLAB_PREFIX } from '../downstream-operations.ts';

function segment(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value) throw new Error('Missing route parameter');
  return encodeURIComponent(value);
}

const facilityModule: CorpusModule = {
  id: 'facility',
  title: '施設・会議',
  icon: '🏫',
  setup(ctx: CorpusContext) {
    const aedilis = makeAedilisConnector(ctx.env);
    ctx.registerConnector(aedilis);

    ensureSchema(ctx.db);
    const r = new Hono();
    r.use('*', async (c, next) => {
      c.header('cache-control', 'private, no-store');
      if (!getUserSession(c)) return c.json({ error: 'unauthorized' }, 401);
      await next();
    });
    r.get('/groups', async c => {
      try { return c.json({ items: await bookingGroups(c, ctx) }); }
      catch { return c.json({ error: 'memberships_unavailable' }, 503); }
    });
    r.get('/facilities', (c) => proxy(c, aedilis, AEDILIS_GLAB_PREFIX + '/facilities', ctx.tokenProvider, 'aedilis'));
    r.get('/facilities/:id', (c) => proxy(
      c,
      aedilis,
      `${AEDILIS_GLAB_PREFIX}/facilities/${segment(c, 'id')}`,
      ctx.tokenProvider,
      'aedilis',
    ));
    for (const resource of ['reservations', 'meetings']) {
      const base = AEDILIS_GLAB_PREFIX + '/' + resource;
      r.get('/' + resource, c => bookingProxy(c, ctx, aedilis, base));
      r.get('/' + resource + '/mine', c => bookingProxy(c, ctx, aedilis, base + '/mine'));
      r.post('/' + resource, c => bookingProxy(c, ctx, aedilis, base));
      r.get('/' + resource + '/:id', c => bookingProxy(c, ctx, aedilis, base + '/' + segment(c, 'id')));
      r.patch('/' + resource + '/:id', c => bookingProxy(c, ctx, aedilis, base + '/' + segment(c, 'id')));
      r.delete('/' + resource + '/:id', c => bookingProxy(c, ctx, aedilis, base + '/' + segment(c, 'id')));
    }
    r.post('/meetings/:id/finalize', c => bookingProxy(c, ctx, aedilis, AEDILIS_GLAB_PREFIX + '/meetings/' + segment(c, 'id') + '/finalize'));
    r.post('/meetings/:id/glab-event', c => finalizeMeetingEvent(c, ctx, aedilis));
    r.post('/meetings/:id/responses', c => bookingProxy(c, ctx, aedilis, AEDILIS_GLAB_PREFIX + '/meetings/' + segment(c, 'id') + '/responses'));
    r.patch('/meetings/:id/responses/:responseId', c => bookingProxy(c, ctx, aedilis, AEDILIS_GLAB_PREFIX + '/meetings/' + segment(c, 'id') + '/responses/' + segment(c, 'responseId')));
    registerMeetRoutes(r, ctx, aedilis);
    ctx.registerRoute(r);

    ctx.registerPanel({ title: '施設・会議', icon: '🏫' });
    ctx.logger.info(
      `facility → Aedilis (${aedilisBaseUrl(ctx.env) || '未設定 = degraded'})`,
    );
  },
};

export default facilityModule;
