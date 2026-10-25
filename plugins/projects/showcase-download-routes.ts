import { requireAdmin, type Hono, type CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { getProject } from '../data.ts';
import { BodyTooLargeError, readBodyWithinLimit } from '../vantan-user/bounded-body.ts';
import { isWindowsExecutable, MAX_EXECUTABLE_BYTES } from './showcase-executable.ts';

export function registerShowcaseDownloads(router: Hono, ctx: CorpusContext): void {
  router.put('/showcase/executable/:id', requireAdmin, async c => {
    const id = c.req.param('id');
    if (!getProject(ctx.db, id)) return c.json({ error: 'not_found' }, 404);
    const name = c.req.query('name') ?? '';
    try {
      const bytes = new Uint8Array(await readBodyWithinLimit(c.req.raw, MAX_EXECUTABLE_BYTES));
      if (!isWindowsExecutable(name, bytes)) return c.json({ error: 'windows_exe_required' }, 400);
      ctx.db.prepare(`INSERT INTO glab_work_binary (project_id,name,content) VALUES (?,?,?)
        ON CONFLICT(project_id) DO UPDATE SET name=excluded.name,content=excluded.content`).run(id, name, bytes);
      return c.json({ ok: true });
    } catch (error) {
      if (error instanceof BodyTooLargeError) return c.json({ error: 'exe_too_large' }, 413);
      ctx.logger.error('Showcase executable upload failed');
      return c.json({ error: 'upload_failed' }, 500);
    }
  });
  router.get('/showcase/download/:id', c => {
    const file = ctx.db.prepare(`SELECT b.name,b.content FROM glab_work_binary b
      JOIN glab_work_showcase s ON s.project_id=b.project_id
      WHERE b.project_id=? AND s.published=1`).get(c.req.param('id')) as { name: string; content: Uint8Array } | undefined;
    if (!file) return c.json({ error: 'not_found' }, 404);
    c.header('content-type', 'application/octet-stream');
    c.header('x-content-type-options', 'nosniff');
    c.header('content-disposition', `attachment; filename="game.exe"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    return c.body(new Uint8Array(file.content));
  });
}
