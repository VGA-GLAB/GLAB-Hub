// @implements SPEC-GLAB-SOFTWARE-LIBRARY-001
import type { SqlDb } from '../data.ts';
import type { LibraryEntry } from './types.ts';
interface Row { id: string; metadata: string; published: number }
export function listLibraries(db: SqlDb, includeDrafts: boolean): LibraryEntry[] {
  const rows = db.prepare(`SELECT id, metadata, published FROM glab_software_library
    WHERE published = 1 OR ? = 1 ORDER BY id LIMIT 200`).all(includeDrafts ? 1 : 0) as Row[];
  return rows.map(row => ({ ...JSON.parse(row.metadata) as Omit<LibraryEntry, 'id' | 'published'>,
    id: row.id, published: row.published === 1 }));
}
export function saveLibrary(db: SqlDb, entry: LibraryEntry, updatedAt: string): void {
  const { id, published, ...metadata } = entry;
  db.prepare(`INSERT INTO glab_software_library (id, metadata, published, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata, published=excluded.published, updated_at=excluded.updated_at`)
    .run(id, JSON.stringify(metadata), published ? 1 : 0, updatedAt);
}
