import {
  connectorGuard,
  el,
  ensureStyles,
  requireVantanUserRegistration,
  section,
  type PanelContext,
} from '../panel-kit.ts';
import type { TendentiaMapView, TendentiaMovement, TendentiaTile } from './map-contract.ts';

/** GLab はゲーム制作ラボなので、最初はゲームのトレンドを開く。 */
const DEFAULT_GENRE = 'game';
const ALL_GENRES = '';

const MOVEMENT_LABELS: Record<TendentiaMovement, string> = {
  new: 'NEW',
  up: '↑',
  down: '↓',
  same: '',
  unknown: '',
};

function isMapView(value: unknown): value is TendentiaMapView {
  if (!value || typeof value !== 'object') return false;
  const view = value as Record<string, unknown>;
  return Array.isArray(view.tiles) && Array.isArray(view.genres);
}

function ensureTrendStyles(): void {
  if (document.getElementById('gl-trend-styles')) return;
  const style = document.createElement('style');
  style.id = 'gl-trend-styles';
  style.textContent = `
    .gl-trend-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 1rem; }
    .gl-trend-chip { font: inherit; cursor: pointer; border-radius: 999px; padding: 0.25rem 0.7rem;
      border: 1px solid var(--line); background: transparent; color: var(--muted); }
    .gl-trend-chip[aria-pressed="true"] { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
    .gl-trend-map { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: stretch; }
    .gl-trend-tile { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.6rem 0.75rem;
      background: var(--bg-2); border: 1px solid var(--line); border-radius: var(--radius);
      color: var(--fg); text-decoration: none; min-width: 9rem; overflow-wrap: anywhere; }
    .gl-trend-tile:hover { border-color: var(--accent); }
    .gl-trend-title { font-weight: 600; line-height: 1.35; }
    .gl-trend-meta { font-size: 0.75rem; color: var(--muted); display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .gl-trend-move-new { color: var(--degraded); font-weight: 700; }
    .gl-trend-move-up { color: var(--up); font-weight: 700; }
    .gl-trend-move-down { color: var(--down); font-weight: 700; }
  `;
  document.head.appendChild(style);
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  ensureTrendStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;
  container.innerHTML = '';
  container.appendChild(el('h2', undefined, '📈 トレンド'));

  const [mapResponse, entryResponse] = await Promise.all([
    ctx.api('/map').catch(() => null),
    ctx.api('/entry-points').catch(() => null),
  ]);
  const publicUrl = await readPublicUrl(entryResponse);
  if (!mapResponse) {
    container.appendChild(unavailable());
    return;
  }
  const guard = await connectorGuard(mapResponse, 'Tendentia');
  if (guard) {
    container.appendChild(guard);
    return;
  }
  const view = await mapResponse.json().catch(() => null);
  if (!isMapView(view)) {
    container.appendChild(unavailable());
    return;
  }

  container.appendChild(el(
    'p',
    'gl-muted',
    `いろいろなジャンルの流行を Tendentia が集めています。大きいほど注目度が高いものです。${
      view.lastCrawledAt ? `最終巡回 ${new Date(view.lastCrawledAt).toLocaleString()}` : ''
    }`,
  ));
  if (publicUrl) {
    const open = el('a', 'gl-btn ghost', 'Tendentia で自分向けのマップを開く');
    open.href = publicUrl;
    open.target = '_blank';
    open.rel = 'noopener noreferrer';
    container.appendChild(open);
  }

  const body = section('トレンドマップ');
  const chips = el('div', 'gl-trend-chips');
  const map = el('div', 'gl-trend-map');
  body.body.append(chips, map);
  container.appendChild(body.wrap);

  const hasGame = view.genres.some((genre) => genre.genre === DEFAULT_GENRE && genre.count > 0);
  let selected = hasGame ? DEFAULT_GENRE : ALL_GENRES;
  const options = [{ genre: ALL_GENRES, label: 'すべて', count: view.tiles.length }, ...view.genres]
    .filter((option) => option.count > 0);

  const render = (): void => {
    chips.replaceChildren(...options.map((option) => {
      const chip = el('button', 'gl-trend-chip', `${option.label} (${option.count})`);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(option.genre === selected));
      chip.onclick = () => {
        selected = option.genre;
        render();
      };
      return chip;
    }));
    const tiles = view.tiles
      .filter((tile) => selected === ALL_GENRES || tile.genre === selected)
      .sort((a, b) => b.interest - a.interest || a.rank - b.rank);
    map.replaceChildren(...(tiles.length
      ? tiles.map(renderTile)
      : [el('p', 'gl-muted', 'このジャンルのトレンドはまだ集まっていません。')]));
  };
  render();
}

function renderTile(tile: TendentiaTile): HTMLElement {
  const node = tile.url ? el('a', 'gl-trend-tile') : el('div', 'gl-trend-tile');
  if (node instanceof HTMLAnchorElement && tile.url) {
    node.href = tile.url;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
  // 注目度 (0〜1) を大きさにする。薄いものも読める大きさで残す。
  const scale = 0.85 + tile.interest * 0.6;
  node.style.fontSize = `${scale.toFixed(2)}rem`;
  node.style.flex = `${(1 + tile.interest * 3).toFixed(2)} 1 ${Math.round(9 + tile.interest * 9)}rem`;
  node.appendChild(el('span', 'gl-trend-title', tile.title));
  if (tile.subtitle) node.appendChild(el('span', 'gl-muted', tile.subtitle));
  const meta = el('span', 'gl-trend-meta');
  meta.appendChild(el('span', undefined, `${tile.sourceName} ${tile.rank}位`));
  const movement = MOVEMENT_LABELS[tile.movement];
  if (movement) meta.appendChild(el('span', `gl-trend-move-${tile.movement}`, movement));
  node.appendChild(meta);
  return node;
}

async function readPublicUrl(response: Response | null): Promise<string | null> {
  if (!response?.ok) return null;
  const body = await response.json().catch(() => null) as { publicUrl?: unknown } | null;
  if (typeof body?.publicUrl !== 'string') return null;
  try {
    const url = new URL(body.publicUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function unavailable(): HTMLElement {
  const notice = el('div', 'gl-notice');
  notice.appendChild(el('strong', undefined, 'Tendentia に未接続'));
  notice.appendChild(el('p', 'gl-muted', 'Tendentia が稼働して接続設定が入ると、ここにトレンドが表示されます。'));
  return notice;
}
