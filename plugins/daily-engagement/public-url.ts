/**
 * 公開用のリンクとして安全な HTTP(S) URL だけを正規化する。
 * URL 内の資格情報は、Hub や Discord 経由での漏えいを防ぐため受け付けない。
 */
export function safePublicHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    if (parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
