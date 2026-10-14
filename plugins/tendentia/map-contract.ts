// Tendentia (Td) のトレンドマップ応答を、GLab タブが表示に使う形だけへ射影する。
//
// Td の `GET /api/trend-crawler/map` は興味の設定 (prefs) や理由の文字列も返すが、
// タブは「ジャンル・タイトル・リンク・大きさ (興味)・順位の動き」しか使わない。
// 上流の列が増えても素通しせず、ここで allowlist する (リンクは http(s) のみ)。

export type TendentiaMovement = 'new' | 'up' | 'down' | 'same' | 'unknown';

export interface TendentiaTile {
  title: string;
  subtitle: string | null;
  url: string | null;
  genre: string;
  sourceName: string;
  rank: number;
  movement: TendentiaMovement;
  /** 0 (興味が薄い) 〜 1 (興味が強い)。タイルの大きさに使う。 */
  interest: number;
}

export interface TendentiaGenre {
  genre: string;
  label: string;
  count: number;
}

export interface TendentiaMapView {
  lastCrawledAt: string | null;
  busy: boolean;
  genres: TendentiaGenre[];
  tiles: TendentiaTile[];
}

/** 1 回の応答で GLab に載せるタイルの上限 (Td は 1 ソース 8 件 × 79 ソース程度)。 */
export const MAX_TILES = 800;
const MAX_TEXT = 200;
const MOVEMENTS: readonly TendentiaMovement[] = ['new', 'up', 'down', 'same', 'unknown'];
const GENRE_PATTERN = /^[a-z_]{1,40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT) : null;
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseTile(value: unknown): TendentiaTile | null {
  if (!isRecord(value)) return null;
  const title = text(value.title);
  const sourceName = text(value.sourceName);
  const genre = typeof value.genre === 'string' && GENRE_PATTERN.test(value.genre) ? value.genre : null;
  const rank = typeof value.rank === 'number' && Number.isInteger(value.rank) && value.rank > 0 ? value.rank : null;
  const interest = typeof value.interest === 'number' && Number.isFinite(value.interest)
    ? Math.min(1, Math.max(0, value.interest))
    : null;
  if (!title || !sourceName || !genre || rank === null || interest === null) return null;
  const status = isRecord(value.movement) ? value.movement.status : null;
  const movement = MOVEMENTS.includes(status as TendentiaMovement) ? status as TendentiaMovement : 'unknown';
  return {
    title,
    subtitle: text(value.subtitle),
    url: httpUrl(value.url),
    genre,
    sourceName,
    rank,
    movement,
    interest,
  };
}

function parseGenre(value: unknown): TendentiaGenre | null {
  if (!isRecord(value)) return null;
  const genre = typeof value.genre === 'string' && GENRE_PATTERN.test(value.genre) ? value.genre : null;
  const label = text(value.label);
  const count = typeof value.count === 'number' && Number.isInteger(value.count) && value.count >= 0 ? value.count : null;
  if (!genre || !label || count === null) return null;
  return { genre, label, count };
}

/**
 * `{ map: { lastCrawledAt, genres, tiles }, busy }` を受け取り、表示用の形に直す。
 * 外側の形が違えば null (呼び出し側が 502 にする)。壊れたタイル・ジャンルは 1 件ずつ捨てる。
 */
export function sanitizeTendentiaMap(value: unknown): TendentiaMapView | null {
  if (!isRecord(value) || !isRecord(value.map)) return null;
  const map = value.map;
  if (!Array.isArray(map.tiles) || !Array.isArray(map.genres)) return null;
  const lastCrawledAt = typeof map.lastCrawledAt === 'string' && !Number.isNaN(Date.parse(map.lastCrawledAt))
    ? map.lastCrawledAt
    : null;
  const tiles = map.tiles.slice(0, MAX_TILES).flatMap((tile) => parseTile(tile) ?? []);
  const genres = map.genres.flatMap((genre) => parseGenre(genre) ?? []);
  return { lastCrawledAt, busy: value.busy === true, genres, tiles };
}
