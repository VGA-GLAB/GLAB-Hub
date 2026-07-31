/** Shared-link URLs are normalized before persistence so equivalent links deduplicate. */
export function normalizeLinkUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  // 共有ボードに credential 付き URL (https://user:pass@host/...) を残さない。
  url.username = '';
  url.password = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
  }
  url.hash = '';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}
