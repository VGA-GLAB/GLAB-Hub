// @implements SPEC-GLAB-SOFTWARE-LIBRARY-001
/** Catalog links are explicit navigation, never server-side fetch or installation. */
export function distributionUrl(value: string): string | null {
  try {
    if (!value || value.length > 2000 || /[\s\u0000-\u001f\u007f\\]/.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.toString();
  } catch { return null; }
}
