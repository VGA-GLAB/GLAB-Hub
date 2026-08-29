export interface DiReviewTrendView {
  gameSlug: string;
  appId: number | null;
  recentReviewCount: number;
  positivePercent: number | null;
  latestReviewAt: string;
}

export interface DiReviewTrendsPayload {
  ok: true;
  source: 'discutere';
  windowDays: 7;
  data: DiReviewTrendView[];
}

/**
 * Upstream data is projected onto the public aggregate contract before relaying it.
 *
 * @implements SPEC-VOLPUTAS-REVIEWS-007
 */
export function sanitizeDiReviewTrends(value: unknown): DiReviewTrendsPayload | null {
  if (
    !isRecord(value)
    || value.ok !== true
    || value.source !== 'discutere'
    || value.windowDays !== 7
    || !Array.isArray(value.data)
  ) return null;
  const trends = value.data.map(parseDiReviewTrend);
  if (!trends.every((trend): trend is DiReviewTrendView => trend !== null)) return null;
  return {
    ok: true,
    source: 'discutere',
    windowDays: 7,
    data: trends,
  };
}

export function parseDiReviewTrends(value: unknown): DiReviewTrendView[] | null {
  return sanitizeDiReviewTrends(value)?.data ?? null;
}

function parseDiReviewTrend(value: unknown): DiReviewTrendView | null {
  const forbidden = ['content', 'review', 'authorId', 'steamId', 'nativeId'];
  if (
    !isRecord(value)
    || forbidden.some((field) => Object.prototype.hasOwnProperty.call(value, field))
    || typeof value.gameSlug !== 'string'
    || !value.gameSlug.trim()
    || !(value.appId === null || (Number.isSafeInteger(value.appId) && (value.appId as number) > 0))
    || !Number.isSafeInteger(value.recentReviewCount)
    || (value.recentReviewCount as number) < 0
    || !(value.positivePercent === null
      || (typeof value.positivePercent === 'number'
        && value.positivePercent >= 0
        && value.positivePercent <= 100))
    || typeof value.latestReviewAt !== 'string'
    || !Number.isFinite(Date.parse(value.latestReviewAt))
  ) return null;
  return {
    gameSlug: value.gameSlug.trim(),
    appId: value.appId as number | null,
    recentReviewCount: value.recentReviewCount as number,
    positivePercent: value.positivePercent as number | null,
    latestReviewAt: value.latestReviewAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
