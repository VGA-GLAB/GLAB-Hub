export interface CernereAdminEntryPoints {
  /** プロフィール / パスキー管理 (他デバイス登録リンクの発行もここ) */
  profileUrl: string;
  /** 個人データ管理 (opt-out) */
  dataOptOutUrl: string;
  /** 組織設定 */
  organizationsUrl: string;
}

export function createCernereAdminEntryPoints(webBaseUrl: string): CernereAdminEntryPoints {
  const baseUrl = new URL(webBaseUrl);
  return {
    profileUrl: new URL('profile', baseUrl).toString(),
    dataOptOutUrl: new URL('data-optout', baseUrl).toString(),
    organizationsUrl: new URL('organizations', baseUrl).toString(),
  };
}
