import postgres from 'postgres';

type DatabaseClient = ReturnType<typeof postgres>;

export interface GlabFacility {
  id: string;
  displayName: string;
  aedilisFacilityId: string;
}

interface FacilityRow {
  id: string;
  display_name: string;
  aedilis_facility_id: string;
}

export class FacilityStore {
  constructor(private readonly sql: DatabaseClient) {}

  async initialize(): Promise<void> {
    await this.sql`
      CREATE TABLE IF NOT EXISTS glab_facility (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        aedilis_facility_id TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
  }

  async list(): Promise<GlabFacility[]> {
    const rows = await this.sql<FacilityRow[]>`
      SELECT id, display_name, aedilis_facility_id
      FROM glab_facility
      ORDER BY display_name, id
    `;
    return rows.map(toFacility);
  }

  async get(id: string): Promise<GlabFacility | null> {
    const rows = await this.sql<FacilityRow[]>`
      SELECT id, display_name, aedilis_facility_id
      FROM glab_facility
      WHERE id = ${id}
      LIMIT 1
    `;
    return rows[0] ? toFacility(rows[0]) : null;
  }

  async promote(candidate: GlabFacility): Promise<GlabFacility> {
    const rows = await this.sql<FacilityRow[]>`
      INSERT INTO glab_facility (id, display_name, aedilis_facility_id)
      VALUES (${candidate.id}, ${candidate.displayName}, ${candidate.aedilisFacilityId})
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        aedilis_facility_id = EXCLUDED.aedilis_facility_id,
        updated_at = NOW()
      RETURNING id, display_name, aedilis_facility_id
    `;
    const promoted = rows[0];
    if (!promoted) throw new Error('failed to promote GLAB facility');
    return toFacility(promoted);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

function toFacility(row: FacilityRow): GlabFacility {
  return {
    id: row.id,
    displayName: row.display_name,
    aedilisFacilityId: row.aedilis_facility_id,
  };
}

let facilityStore: FacilityStore | null = null;

export async function initializeFacilityStore(
  databaseUrl: string | undefined,
): Promise<FacilityStore> {
  if (facilityStore) return facilityStore;
  const normalized = databaseUrl?.trim();
  if (!normalized) throw new Error('GLAB_DATABASE_URL is required');
  const url = new URL(normalized);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('GLAB_DATABASE_URL must use postgres:// or postgresql://');
  }
  const store = new FacilityStore(postgres(normalized, { max: 3 }));
  try {
    await store.initialize();
  } catch (error) {
    await store.close().catch(() => undefined);
    throw error;
  }
  facilityStore = store;
  return store;
}

export function getFacilityStore(): FacilityStore {
  if (!facilityStore) throw new Error('GLAB facility store has not been initialized');
  return facilityStore;
}

export async function closeFacilityStore(): Promise<void> {
  const store = facilityStore;
  facilityStore = null;
  if (store) await store.close();
}
