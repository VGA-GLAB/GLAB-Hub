import type { SqlDb } from '../data.ts';
import type { QuestInput, QuestRow } from './model.ts';

export function getQuest(db: SqlDb, id: string): QuestRow | undefined {
  return db.prepare('SELECT * FROM glab_quest WHERE id = ?').get(id) as QuestRow | undefined;
}
export function createQuest(db: SqlDb, id: string, owner: string, input: QuestInput, now: number): void {
  db.prepare(`INSERT INTO glab_quest(id,owner_id,title,description,period,conditions,contact_type,contact,project_id,category,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,owner,input.title,input.description,input.period,input.conditions,input.contactType,input.contact,input.projectId,input.category,now,now);
}
/** Every edit removes publication and approval; optimistic revisions prevent stale approval.
 * @implements SPEC-GLAB-QUEST-001
 */
export function editQuest(db: SqlDb, id: string, owner: string, revision: number, input: QuestInput, now: number): boolean {
  return Number(db.prepare(`UPDATE glab_quest SET title=?,description=?,period=?,conditions=?,contact_type=?,contact=?,project_id=?,category=?,
    status='draft',approved_by=NULL,approved_role=NULL,approved_at=NULL,revision=revision+1,updated_at=?
    WHERE id=? AND owner_id=? AND revision=?`).run(input.title,input.description,input.period,input.conditions,input.contactType,input.contact,input.projectId,input.category,now,id,owner,revision).changes) === 1;
}
export function changeOwnQuest(db: SqlDb, id: string, owner: string, revision: number, action: 'submit' | 'withdraw', now: number): boolean {
  const condition = action === 'submit' ? "status='draft' AND length(trim(contact))>0 AND length(trim(title))>0 AND length(trim(description))>0 AND length(trim(period))>0 AND length(trim(conditions))>0" : "status!='withdrawn'";
  return Number(db.prepare(`UPDATE glab_quest SET status=?,revision=revision+1,updated_at=?,
    approved_by=NULL,approved_role=NULL,approved_at=NULL WHERE id=? AND owner_id=? AND revision=? AND ${condition}`)
    .run(action === 'submit' ? 'pending' : 'withdrawn',now,id,owner,revision).changes) === 1;
}
export function decideQuest(db: SqlDb, id: string, revision: number, approver: string, role: 'lead' | 'instructor', approve: boolean, now: number): boolean {
  const complete=approve ? ' AND length(trim(description))>0 AND length(trim(period))>0 AND length(trim(conditions))>0 AND length(trim(contact))>0' : '';
  return Number(db.prepare(`UPDATE glab_quest SET status=?,approved_by=?,approved_role=?,approved_at=?,revision=revision+1,updated_at=?
    WHERE id=? AND revision=? AND status='pending'${complete}`).run(approve ? 'published' : 'draft',approve ? approver : null,
    approve ? role : null,approve ? now : null,now,id,revision).changes) === 1;
}
export function listOwnQuests(db: SqlDb, owner: string): QuestRow[] {
  return db.prepare('SELECT * FROM glab_quest WHERE owner_id=? ORDER BY updated_at DESC').all(owner) as QuestRow[];
}
export function listPendingQuests(db: SqlDb): QuestRow[] {
  return db.prepare("SELECT * FROM glab_quest WHERE status='pending' ORDER BY updated_at").all() as QuestRow[];
}
/** Public projection deliberately excludes account IDs and draft/contact history. */
export function listPublicQuests(db: SqlDb): Array<Pick<QuestRow,'id'|'title'|'description'|'period'|'conditions'|'contact_type'|'contact'|'category'|'approved_role'|'approved_at'>> {
  return db.prepare(`SELECT id,title,description,period,conditions,contact_type,contact,category,approved_role,approved_at FROM glab_quest
    WHERE status='published' AND approved_at IS NOT NULL ORDER BY updated_at DESC`).all() as ReturnType<typeof listPublicQuests>;
}
