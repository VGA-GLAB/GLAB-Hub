import type { DiReviewTrendView } from '../di/review-trend-contract.ts';
import type { GameView, RecentGameView } from './contracts.ts';

export interface ReviewSuggestion {
  gameId: string | null;
  gameTitle: string;
  detail: string;
  rank: number;
}

/** Steam Store のゲーム詳細 URL だけを App ID へ変換する。 */
export function steamAppIdFromStoreUrl(value: string | null): number | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'store.steampowered.com') return null;
    const match = /^\/app\/(\d+)(?:\/|$)/.exec(url.pathname);
    if (!match) return null;
    const appId = Number(match[1]);
    return Number.isSafeInteger(appId) && appId > 0 ? appId : null;
  } catch {
    // Invalid or relative URLs cannot identify a Steam application.
    return null;
  }
}

/** @implements SPEC-VOLPUTAS-REVIEWS-008 */
export function mergeReviewSuggestions(
  games: GameView[],
  recentGames: RecentGameView[],
  diTrends: DiReviewTrendView[],
): ReviewSuggestion[] {
  const active = games.filter((game) => game.isActive);
  const byAppId = new Map<number, GameView>();
  for (const game of active) {
    const appId = steamAppIdFromStoreUrl(game.storeUrl);
    if (appId !== null) byAppId.set(appId, game);
  }

  const suggestions = new Map<string, ReviewSuggestion>();
  for (const trend of diTrends) {
    if (trend.appId === null || trend.recentReviewCount === 0) continue;
    const game = byAppId.get(trend.appId);
    if (!game) continue;
    const positive = trend.positivePercent === null ? '' : `・好評 ${trend.positivePercent}%`;
    suggestions.set(normalizeGameTitle(game.title), {
      gameId: game.id,
      gameTitle: game.title,
      detail: `Di取得済みSteamレビューの直近7日 ${trend.recentReviewCount}件${positive}`,
      rank: 1_000_000 + trend.recentReviewCount,
    });
  }
  for (const recent of recentGames) {
    const game = active.find((candidate) => normalizeGameTitle(candidate.title) === normalizeGameTitle(recent.name));
    // マスタが存在する場合は登録済み作品だけを投稿先にする。空の間は従来どおり自由入力。
    if (active.length > 0 && !game) continue;
    const key = normalizeGameTitle(game?.title ?? recent.name);
    const existing = suggestions.get(key);
    suggestions.set(key, {
      gameId: game?.id ?? null,
      gameTitle: game?.title ?? recent.name,
      detail: existing
        ? `${existing.detail}・最近プレイ ${recent.playtimeTwoWeeksMinutes}分`
        : `Steamで最近プレイ ${recent.playtimeTwoWeeksMinutes}分`,
      rank: (existing?.rank ?? 0) + recent.playtimeTwoWeeksMinutes,
    });
  }
  return [...suggestions.values()].sort((a, b) => b.rank - a.rank);
}

function normalizeGameTitle(value: string): string {
  return value.trim().normalize('NFKC').toLowerCase();
}
