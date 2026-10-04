export default {
  /** C-9: health に宣言が無い・空・形式違いなら null (中継側はそれを 503 にする)。 */
  post: (result: string | null, payload: unknown): boolean => {
    const raw = payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).locationStatement : undefined;
    if (typeof raw !== 'string' || !raw.trim()) return result === null;
    return result === null || (result === raw.trim() && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(result));
  },
};
