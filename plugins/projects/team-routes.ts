import { getIdentity, getDisplayName, type Hono, type CorpusContext } from '../../corpus/server/hub/sdk.ts';
import { getProjectWithMembers, listProjectsWithMembers, listProjectReleases } from '../data.ts';

/** Existing project membership is the sole authority for TEAM views.
 * @implements SPEC-GLAB-TEAM-NAVIGATION-001
 */
export function registerTeamRoutes(router: Hono, ctx: CorpusContext): void {
  router.use('/teams/*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });
  router.get('/teams/mine', c => {
    const userId = getIdentity(c).userId;
    const teams = listProjectsWithMembers(ctx.db, { status: 'active' })
      .filter(project => project.members.some(member => member.user_id === userId))
      .map(project => ({ id: project.id, name: project.name }));
    return c.json({ teams });
  });
  router.get('/teams/:id', c => {
    const project = getProjectWithMembers(ctx.db, c.req.param('id'));
    if (!project || project.status !== 'active' || !project.members.some(member => member.user_id === getIdentity(c).userId)) {
      return c.json({ error: 'team_unavailable' }, 404);
    }
    return c.json({ team: {
      id: project.id, name: project.name, description: project.description, repoUrl: project.repo_url,
      members: project.members.map(member => ({ userId: member.user_id, name: getDisplayName(ctx.db, member.user_id), role: member.role })),
      releases: listProjectReleases(ctx.db, project.id).map(release => ({ tag: release.tag, name: release.name, publishedAt: release.published_at })),
    } });
  });
}
