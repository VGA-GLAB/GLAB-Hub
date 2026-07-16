/** Ostiarius が health で広告した、会場LAN内ブラウザ向けURLだけを採用する。 */
export function ostiariusBrowserBaseUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const lanUrl = (payload as Record<string, unknown>).lanUrl;
  if (typeof lanUrl !== 'string' || !lanUrl.trim()) return null;
  try {
    const parsed = new URL(lanUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      return null;
    }
    return parsed.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}
