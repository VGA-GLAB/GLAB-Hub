export interface CernereAdminEntryPoints {
  /** プロフィール / パスキー管理 (他デバイス登録リンクの発行もここ) */
  profileUrl: string;
  /** 個人データ管理 (opt-out) */
  dataOptOutUrl: string;
  /** 組織設定 */
  organizationsUrl: string;
}

export function normalizeCernereWebUrl(value: string | undefined, envName: string): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${envName} must be an absolute HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${envName} must use HTTP or HTTPS`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${envName} must not contain credentials, query, or fragment`);
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  return url.toString();
}

export function createCernereAdminEntryPoints(webBaseUrl: string): CernereAdminEntryPoints {
  const baseUrl = new URL(webBaseUrl);
  return {
    profileUrl: new URL('profile', baseUrl).toString(),
    dataOptOutUrl: new URL('data-optout', baseUrl).toString(),
    organizationsUrl: new URL('organizations', baseUrl).toString(),
  };
}
