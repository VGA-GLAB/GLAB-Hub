export interface PublishedConclusion {
  id: string;
  title: string;
  conclusion: string;
  updatedAt: number;
  scope: 'public' | 'glab';
}

/** Allowlist the result fields; reject malformed or non-public upstream records. */
export function parsePublishedConclusions(value: unknown): PublishedConclusion[] | null {
  if (!value || typeof value !== 'object') return null;
  const rows = (value as Record<string, unknown>).conclusions;
  if (!Array.isArray(rows) || rows.length > 200) return null;
  const result: PublishedConclusion[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || row.id.length > 500
      || typeof row.title !== 'string' || typeof row.conclusion !== 'string' || !row.conclusion.trim()
      || typeof row.updatedAt !== 'number' || !Number.isFinite(row.updatedAt)
      || (row.scope !== 'public' && row.scope !== 'glab')) return null;
    result.push({ id: row.id, title: row.title, conclusion: row.conclusion, updatedAt: row.updatedAt, scope: row.scope });
  }
  return result;
}

export function conclusionEndpoint(base: string): URL | null {
  try {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
    return new URL('api/integrations/glab/conclusions', url.href.endsWith('/') ? url : `${url.href}/`);
  } catch { return null; }
}
