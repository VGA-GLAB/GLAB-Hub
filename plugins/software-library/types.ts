export const KIND_LABELS = { runtime: '動作に必要なライブラリ', plugin: '追加機能', sdk: '開発用ライブラリ' } as const;
export const PLATFORM_LABELS = { windows: 'Windows', macos: 'macOS', linux: 'Linux', any: '共通' } as const;
export interface LibraryEntry {
  id: string;
  name: string;
  description: string;
  kind: keyof typeof KIND_LABELS;
  platform: keyof typeof PLATFORM_LABELS;
  version: string;
  license: string;
  downloadUrl: string;
  sha256: string;
  published: boolean;
}

/** Browser projection is explicit: distribution and signing internals stay server-side. */
export type LibrarySummary = Pick<LibraryEntry,
  'id' | 'name' | 'description' | 'kind' | 'platform' | 'version' | 'license' | 'published'>;

export function librarySummary(entry: LibraryEntry): LibrarySummary {
  return { id: entry.id, name: entry.name, description: entry.description,
    kind: entry.kind, platform: entry.platform, version: entry.version,
    license: entry.license, published: entry.published };
}
