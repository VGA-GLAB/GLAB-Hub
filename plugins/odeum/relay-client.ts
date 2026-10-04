// odeum-relay の `GET /v1/sessions` を叩いて、 発表者の接続状態と視聴者数を得る。
//
// 中継へ届かない・応答が壊れているときは null を返す (呼び出し側は台帳だけで
// 縮退表示する)。 Bearer に載せる service チケットはログに出さない。

export interface RelaySessionStatus {
  sid: string;
  presenterConnected: boolean;
  viewerCount: number;
  startedAt: number | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const RELAY_TIMEOUT_MS = 3_000;

export async function fetchRelaySessions(
  httpBase: string,
  serviceTicket: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = RELAY_TIMEOUT_MS,
): Promise<Map<string, RelaySessionStatus> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL('v1/sessions', httpBase).toString(), {
      headers: { authorization: `Bearer ${serviceTicket}`, accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseRelaySessions(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 中継応答 `[{sid, presenter_connected, viewer_count, started_at}]` を検証して写像する。 */
export function parseRelaySessions(body: unknown): Map<string, RelaySessionStatus> | null {
  if (!Array.isArray(body)) return null;
  const sessions = new Map<string, RelaySessionStatus>();
  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.sid !== 'string' || !row.sid) continue;
    sessions.set(row.sid, {
      sid: row.sid,
      presenterConnected: row.presenter_connected === true,
      viewerCount: typeof row.viewer_count === 'number' && Number.isFinite(row.viewer_count)
        ? Math.max(0, Math.floor(row.viewer_count))
        : 0,
      startedAt: parseStartedAt(row.started_at),
    });
  }
  return sessions;
}

function parseStartedAt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
