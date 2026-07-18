import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createProject,
  getProject,
  getProjectWithMembers,
  listProjectMembers,
  listProjects,
  removeProjectMember,
  updateProject,
  upsertProjectMember,
  type ProjectMemberRow,
  type ProjectRow,
  type SqlDb,
  type SqlStatement,
} from '../plugins/data.ts';

class ProjectDataDb implements SqlDb {
  readonly projects = new Map<string, ProjectRow>();
  readonly members = new Map<string, ProjectMemberRow>();

  exec(): void {}

  prepare(sql: string): SqlStatement {
    return {
      get: (...params) => {
        if (sql.includes('FROM glab_project WHERE id')) {
          return this.projects.get(String(params[0]));
        }
        if (sql.includes('FROM glab_project_member WHERE project_id = ? AND user_id = ?')) {
          return this.members.get(memberKey(String(params[0]), String(params[1])));
        }
        return undefined;
      },
      all: (...params) => {
        if (sql.includes('FROM glab_project_member WHERE project_id')) {
          return [...this.members.values()]
            .filter((m) => m.project_id === String(params[0]))
            .sort((a, b) => a.created_at - b.created_at);
        }
        if (sql.includes('FROM glab_project WHERE status')) {
          return [...this.projects.values()]
            .filter((p) => p.status === String(params[0]))
            .sort((a, b) => b.created_at - a.created_at);
        }
        if (sql.includes('FROM glab_project ORDER BY')) {
          return [...this.projects.values()].sort((a, b) => b.created_at - a.created_at);
        }
        return [];
      },
      run: (...params) => {
        if (sql.includes('INSERT INTO glab_project (')) {
          const [id, name, description, repoUrl, createdAt, updatedAt] = params;
          this.projects.set(String(id), {
            id: String(id),
            name: String(name),
            description: (description as string | null) ?? null,
            status: 'active',
            repo_url: (repoUrl as string | null) ?? null,
            created_at: Number(createdAt),
            updated_at: Number(updatedAt),
          });
          return { lastInsertRowid: 0, changes: 1 };
        }
        if (sql.includes('UPDATE glab_project') && !sql.includes('glab_project_member')) {
          const [name, description, status, repoUrl, updatedAt, id] = params;
          const current = this.projects.get(String(id));
          if (!current) return { lastInsertRowid: 0, changes: 0 };
          this.projects.set(String(id), {
            ...current,
            name: String(name),
            description: (description as string | null) ?? null,
            status: status as ProjectRow['status'],
            repo_url: (repoUrl as string | null) ?? null,
            updated_at: Number(updatedAt),
          });
          return { lastInsertRowid: 0, changes: 1 };
        }
        if (sql.includes('INSERT INTO glab_project_member')) {
          const [projectId, userId, role, createdAt] = params;
          const key = memberKey(String(projectId), String(userId));
          const existing = this.members.get(key);
          this.members.set(key, {
            project_id: String(projectId),
            user_id: String(userId),
            role: role as ProjectMemberRow['role'],
            created_at: existing ? existing.created_at : Number(createdAt),
          });
          return { lastInsertRowid: 0, changes: 1 };
        }
        if (sql.includes('DELETE FROM glab_project_member')) {
          const key = memberKey(String(params[0]), String(params[1]));
          const existed = this.members.delete(key);
          return { lastInsertRowid: 0, changes: existed ? 1 : 0 };
        }
        return { lastInsertRowid: 0, changes: 0 };
      },
    };
  }
}

function memberKey(projectId: string, userId: string): string {
  return `${projectId}:${userId}`;
}

describe('GLAB project registry data', () => {
  it('creates a project with active status and no members', () => {
    const db = new ProjectDataDb();
    const created = createProject(db, { name: 'Kuzu Survivors' });

    assert.equal(created.status, 'active');
    assert.equal(created.name, 'Kuzu Survivors');
    assert.equal(getProject(db, created.id)?.id, created.id);
    assert.equal(listProjectMembers(db, created.id).length, 0);
  });

  it('lists projects filtered by status, newest first', () => {
    const db = new ProjectDataDb();
    const first = createProject(db, { name: 'Project A' });
    const second = createProject(db, { name: 'Project B' });
    updateProject(db, second.id, {
      name: second.name,
      description: second.description,
      status: 'paused',
      repoUrl: second.repo_url,
    });

    assert.equal(listProjects(db, {}).length, 2);
    const active = listProjects(db, { status: 'active' });
    assert.equal(active.length, 1);
    assert.equal(active[0]?.id, first.id);
    const paused = listProjects(db, { status: 'paused' });
    assert.equal(paused[0]?.id, second.id);
  });

  it('updates project fields via merged patch (read-modify-write)', () => {
    const db = new ProjectDataDb();
    const created = createProject(db, { name: 'Old Name', description: 'old' });
    const updated = updateProject(db, created.id, {
      name: 'New Name',
      description: created.description,
      status: created.status,
      repoUrl: 'https://example.com/repo',
    });

    assert.equal(updated?.name, 'New Name');
    assert.equal(updated?.description, 'old');
    assert.equal(updated?.repo_url, 'https://example.com/repo');
  });

  it('returns null when updating a non-existent project', () => {
    const db = new ProjectDataDb();
    const updated = updateProject(db, 'missing-id', {
      name: 'x',
      description: null,
      status: 'active',
      repoUrl: null,
    });
    assert.equal(updated, null);
  });

  it('upserts a member and allows role change without duplicating rows', () => {
    const db = new ProjectDataDb();
    const project = createProject(db, { name: 'Project C' });

    upsertProjectMember(db, project.id, 'cernere-user-1', 'member');
    const promoted = upsertProjectMember(db, project.id, 'cernere-user-1', 'producer');

    assert.equal(promoted.role, 'producer');
    assert.equal(listProjectMembers(db, project.id).length, 1);
  });

  it('removes a member and reports whether a row was deleted', () => {
    const db = new ProjectDataDb();
    const project = createProject(db, { name: 'Project D' });
    upsertProjectMember(db, project.id, 'cernere-user-2', 'member');

    assert.equal(removeProjectMember(db, project.id, 'cernere-user-2'), true);
    assert.equal(removeProjectMember(db, project.id, 'cernere-user-2'), false);
    assert.equal(listProjectMembers(db, project.id).length, 0);
  });

  it('getProjectWithMembers combines project + member rows, null when missing', () => {
    const db = new ProjectDataDb();
    const project = createProject(db, { name: 'Project E' });
    upsertProjectMember(db, project.id, 'cernere-user-3', 'producer');

    const found = getProjectWithMembers(db, project.id);
    assert.equal(found?.members.length, 1);
    assert.equal(found?.members[0]?.role, 'producer');
    assert.equal(getProjectWithMembers(db, 'missing-id'), null);
  });
});
