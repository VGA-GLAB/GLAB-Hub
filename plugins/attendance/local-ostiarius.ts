const LOCAL_HEALTH_TIMEOUT_MS = 3_000;

/** 利用者ブラウザが会場LAN内のOstiariusへ直接到達できるかを確認する。 */
export async function canReachLocalOstiarius(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOCAL_HEALTH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/health`, {
      cache: 'no-store',
      mode: 'cors',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null) as { service?: unknown; ok?: unknown } | null;
    return body?.service === 'ostiarius' && body.ok !== false;
  } catch {
    // 学外・権限拒否・Os停止はいずれも「会場LANから到達不能」として扱う。
    return false;
  } finally {
    clearTimeout(timer);
  }
}
