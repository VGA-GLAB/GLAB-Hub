import { randomUUID } from 'node:crypto';
import { Hono, getIdentity, getServicePrincipal } from '../../corpus/server/hub/sdk.ts';
import type { CorpusDb } from '../../corpus/server/hub/sdk.ts';
import { z } from 'zod';
import { readAdmission } from '../access/store.ts';
import { resolveRoles } from '../roles/audience.ts';
import { QUEST_TEMPLATES } from './model.ts';
import { changeOwnQuest, createQuest, decideQuest, editQuest, listOwnQuests, listPendingQuests } from './store.ts';

const input = z.object({ title: z.string().trim().min(1).max(120), description: z.string().trim().max(5000),
  contact: z.string().trim().max(500), projectId: z.string().min(1).max(200).nullable(), category: z.enum(['team','urgent','personal']) }).strict();
const revision = z.object({ revision: z.number().int().nonnegative() }).strict();
const edit = input.extend({ revision: z.number().int().nonnegative() });

export function createQuestRoutes(db: CorpusDb): Hono {
  const router = new Hono();
  router.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    if (getServicePrincipal(c)) return c.json({ error: 'member_required' }, 403);
    const identity = getIdentity(c);
    if (!identity.isAdmin && readAdmission(db, identity.userId)?.status !== 'approved') return c.json({ error: 'member_required' }, 403);
    await next();
  });
  const projectAllowed = (user: string, projectId: string | null): boolean => projectId === null || Boolean(db.prepare(
    "SELECT 1 FROM glab_project_member m JOIN glab_project p ON p.id=m.project_id WHERE m.user_id=? AND m.project_id=? AND p.status='active'"
  ).get(user, projectId));
  router.get('/mine', c => {
    const user = getIdentity(c).userId;
    const roles = resolveRoles(db,user);
    return c.json({ quests: listOwnQuests(db,user), canApprove: roles.includes('lead') || roles.includes('instructor'), templates: QUEST_TEMPLATES,
      projects: db.prepare("SELECT p.id,p.name FROM glab_project p JOIN glab_project_member m ON m.project_id=p.id WHERE m.user_id=? AND p.status='active'").all(user) });
  });
  router.post('/', async c => {
    const parsed = input.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_quest' },400);
    const user = getIdentity(c).userId;
    if (!projectAllowed(user,parsed.data.projectId)) return c.json({ error: 'project_membership_required' },403);
    const id = randomUUID();
    createQuest(db,id,user,parsed.data,Date.now());
    return c.json({ id },201);
  });
  router.put('/:id', async c => {
    const parsed = edit.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_quest' },400);
    const user = getIdentity(c).userId;
    if (!projectAllowed(user,parsed.data.projectId)) return c.json({ error: 'project_membership_required' },403);
    return editQuest(db,c.req.param('id'),user,parsed.data.revision,parsed.data,Date.now())
      ? c.json({ ok:true }) : c.json({ error:'quest_changed_reload' },409);
  });
  for (const action of ['submit','withdraw'] as const) router.post(`/:id/${action}`, async c => {
    const parsed = revision.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error:'invalid_revision' },400);
    return changeOwnQuest(db,c.req.param('id'),getIdentity(c).userId,parsed.data.revision,action,Date.now())
      ? c.json({ ok:true }) : c.json({ error:'quest_changed_or_incomplete' },409);
  });
  router.get('/pending', c => {
    const roles=resolveRoles(db,getIdentity(c).userId);
    if (!roles.includes('lead') && !roles.includes('instructor')) return c.json({ error:'approver_required' },403);
    return c.json({ quests:listPendingQuests(db) });
  });
  router.post('/:id/decision', async c => {
    const user=getIdentity(c).userId;
    const roles=resolveRoles(db,user);
    const role=roles.includes('lead') ? 'lead' : roles.includes('instructor') ? 'instructor' : null;
    if (!role) return c.json({ error:'approver_required' },403);
    const parsed=revision.extend({ approve:z.boolean() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error:'invalid_decision' },400);
    return decideQuest(db,c.req.param('id'),parsed.data.revision,user,role,parsed.data.approve,Date.now())
      ? c.json({ ok:true }) : c.json({ error:'quest_changed_reload' },409);
  });
  return router;
}
