import assert from 'node:assert/strict';
import { it } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { GLAB_SCHEMA, type SqlDb } from '../plugins/data.ts';
import { isWorkMember, linkedAuthors, saveShowcase, listShowcaseRows, setWorkProfile } from '../plugins/projects/showcase-store.ts';

it('profile links are opt-in and disappear when project membership is removed', () => {
  const database = new DatabaseSync(':memory:');
  const db = database as unknown as SqlDb;
  try {
    db.exec(GLAB_SCHEMA);
    db.prepare(`INSERT INTO glab_project (id,name,status,created_at,updated_at) VALUES (?,?,'active',1,1)`).run('p', '作品');
    db.prepare(`INSERT INTO glab_project_member (project_id,user_id,role,created_at) VALUES (?,?,'member',1)`).run('p', 'student');
    assert.equal(isWorkMember(db, 'p', 'stranger'), false);
    assert.deepEqual(linkedAuthors(db, 'p'), []);
    saveShowcase(db, 'p', { introduction: '遊んでみてください', graduationYear: 2026, published: true });
    setWorkProfile(db, 'p', 'student', true);
    assert.deepEqual(linkedAuthors(db, 'p'), ['student']);
    assert.equal(listShowcaseRows(db)[0].graduation_year, 2026);
    setWorkProfile(db, 'p', 'student', false);
    assert.deepEqual(linkedAuthors(db, 'p'), []);
    setWorkProfile(db, 'p', 'student', true);
    db.prepare('DELETE FROM glab_project_member WHERE project_id=? AND user_id=?').run('p', 'student');
    assert.deepEqual(linkedAuthors(db, 'p'), []);
    db.exec(GLAB_SCHEMA);
    assert.equal(listShowcaseRows(db)[0].published, 1);
  } finally { database.close(); }
});
