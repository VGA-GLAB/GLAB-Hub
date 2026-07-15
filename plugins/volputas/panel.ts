import {
  el,
  ensureStyles,
  requireVantanUserRegistration,
  section,
  type PanelContext,
} from '../panel-kit.ts';

interface VolputasEntryPoints {
  homeUrl: string;
  videoReviewUrl: string;
  gameReviewUrl: string;
}

function parseEntryPoints(value: unknown): VolputasEntryPoints | null {
  if (!value || typeof value !== 'object') return null;
  const fields = value as Record<string, unknown>;
  if (
    typeof fields.homeUrl !== 'string'
    || typeof fields.videoReviewUrl !== 'string'
    || typeof fields.gameReviewUrl !== 'string'
  ) return null;
  try {
    const homeUrl = new URL(fields.homeUrl);
    const videoReviewUrl = new URL(fields.videoReviewUrl);
    const gameReviewUrl = new URL(fields.gameReviewUrl);
    if (!['http:', 'https:'].includes(homeUrl.protocol)) return null;
    if (!['http:', 'https:'].includes(videoReviewUrl.protocol)) return null;
    if (!['http:', 'https:'].includes(gameReviewUrl.protocol)) return null;
  } catch {
    return null;
  }
  return {
    homeUrl: fields.homeUrl,
    videoReviewUrl: fields.videoReviewUrl,
    gameReviewUrl: fields.gameReviewUrl,
  };
}

function externalLink(label: string, href: string, className: string): HTMLAnchorElement {
  const link = el('a', className, label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  container.innerHTML = '';
  const heading = el('div', 'gl-row');
  heading.appendChild(el('h2', undefined, '📝 Volputas レビュー'));
  container.appendChild(heading);

  let response: Response;
  try {
    response = await ctx.api('/entry-points');
  } catch {
    renderUnavailable(container, 'Volputas の接続情報を取得できませんでした。');
    return;
  }
  if (response.status === 503) {
    renderUnavailable(container, 'Volputas が稼働して接続設定が入ると利用できます。');
    return;
  }
  if (!response.ok) {
    renderUnavailable(container, `Volputas の接続情報を取得できませんでした (${response.status})。`);
    return;
  }

  const entryPoints = parseEntryPoints(await response.json().catch(() => null));
  if (!entryPoints) {
    renderUnavailable(container, 'Volputas の接続情報が不正です。');
    return;
  }

  const gameReview = section('ゲームレビュー');
  gameReview.body.appendChild(el(
    'p',
    'gl-muted',
    '自分たちで開発したゲーム、市販のゲームのどちらでも、5段階評価とレビュー本文を投稿できます。',
  ));
  const gameReviewActions = el('div', 'gl-row');
  gameReviewActions.appendChild(externalLink(
    'ゲームレビューを投稿',
    entryPoints.gameReviewUrl,
    'gl-btn',
  ));
  gameReview.body.appendChild(gameReviewActions);
  container.appendChild(gameReview.wrap);

  const videoReview = section('プレイ動画から感情を記録');
  videoReview.body.appendChild(el(
    'p',
    'gl-muted',
    '録画済み動画をアップロードし、再生しながら「ここ良かった」「ここ悪かった」やコメントを感情が動いた位置へ配置できます。',
  ));
  const actions = el('div', 'gl-row');
  actions.append(
    externalLink('動画レビューを作成', entryPoints.videoReviewUrl, 'gl-btn'),
    externalLink('Volputas ホーム', entryPoints.homeUrl, 'gl-btn ghost'),
  );
  videoReview.body.appendChild(actions);
  videoReview.body.appendChild(el(
    'p',
    'gl-muted',
    'Volputas が別タブで開きます。初回は Volputas へのログインが必要です。',
  ));
  container.appendChild(videoReview.wrap);
}

function renderUnavailable(container: HTMLElement, message: string): void {
  const notice = el('div', 'gl-notice');
  notice.appendChild(el('strong', undefined, 'Volputas に未接続'));
  notice.appendChild(el('p', 'gl-muted', message));
  container.appendChild(notice);
}
