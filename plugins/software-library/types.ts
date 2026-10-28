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
