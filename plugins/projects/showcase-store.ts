import type { SqlDb } from '../data.ts';

export interface ShowcaseRow {
  project_id: string;
  name: string;
  introduction: string;
  graduation_year: number | null;
  published: number;
}
export interface ShowcaseSettings {
  introduction: string;
  graduationYear: number | null;
  published: boolean;
}

export function listShowcaseRows(db: SqlDb): ShowcaseRow[] {
  return db.prepare(`SELECT p.id project_id, p.name, COALESCE(s.introduction, '') introduction,
    s.graduation_year, COALESCE(s.published, 0) published FROM glab_project p
    LEFT JOIN glab_work_showcase s ON s.project_id = p.id ORDER BY s.graduation_year DESC, p.name`).all() as ShowcaseRow[];
}

export function workDownloads(db: SqlDb, projectId: string): { name: string; size: number; downloadPath: string }[] {
  const file = db.prepare('SELECT name, length(content) size FROM glab_work_binary WHERE project_id=?')
    .get(projectId) as { name: string; size: number } | undefined;
  return file ? [{ ...file, downloadPath: `/api/x/projects/showcase/download/${encodeURIComponent(projectId)}` }] : [];
}

export function saveShowcase(db: SqlDb, projectId: string, settings: ShowcaseSettings): void {
  db.prepare(`INSERT INTO glab_work_showcase (project_id, introduction, graduation_year, published)
    VALUES (?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET introduction=excluded.introduction,
    graduation_year=excluded.graduation_year, published=excluded.published`).run(
    projectId, settings.introduction, settings.graduationYear, Number(settings.published));
}

export function linkedAuthors(db: SqlDb, projectId: string): string[] {
  return (db.prepare(`SELECT w.user_id FROM glab_work_profile w JOIN glab_project_member m
    ON m.project_id=w.project_id AND m.user_id=w.user_id WHERE w.project_id=?`).all(projectId) as { user_id: string }[])
    .map(row => row.user_id);
}

export function isWorkMember(db: SqlDb, projectId: string, userId: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM glab_project_member WHERE project_id=? AND user_id=?').get(projectId, userId));
}

export function setWorkProfile(db: SqlDb, projectId: string, userId: string, featured: boolean): void {
  if (featured) db.prepare('INSERT OR IGNORE INTO glab_work_profile (project_id,user_id) VALUES (?,?)').run(projectId, userId);
  else db.prepare('DELETE FROM glab_work_profile WHERE project_id=? AND user_id=?').run(projectId, userId);
}
