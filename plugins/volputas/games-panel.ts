import { el, type PanelContext } from '../panel-kit.ts';
import { parseGameList, type GameView } from './contracts.ts';
import { steamAppIdFromStoreUrl } from './review-suggestions.ts';

/**
 * ゲームマスタの読み出しと管理 UI。
 *
 * 一覧は感想フォームと感情曲線タブが共有するので、 パネル再描画のたびに
 * 取りに行かないよう 1 回分だけ覚えておく。
 */
export async function loadGames(
  ctx: PanelContext,
  { includeInactive = false } = {},
): Promise<GameView[] | null> {
  const path = includeInactive ? '/games/admin' : '/games';
  const response = await ctx.api(path).catch(() => null);
  if (!response?.ok) return null;
  return parseGameList(await response.json().catch(() => null));
}

/**
 * ゲーム名の入力欄。 マスタがあれば選択、 無ければ自由入力に落とす。
 *
 * マスタが空の段階で選択専用にすると、 管理者が 1 本目を登録するまで誰も
 * 感想を書けなくなる。
 */
export function gameSelector(games: GameView[] | null): {
  element: HTMLElement;
  read: () => { gameId: string | null; gameTitle: string };
  reset: () => void;
  selectSuggestion: (suggestion: { gameId: string | null; gameTitle: string }) => boolean;
} {
  const active = (games ?? []).filter((game) => game.isActive);
  if (active.length === 0) {
    const input = el('input', 'gl-input') as HTMLInputElement;
    input.placeholder = 'ゲーム名';
    input.required = true;
    return {
      element: input,
      read: () => ({ gameId: null, gameTitle: input.value.trim() }),
      reset: () => { input.value = ''; },
      selectSuggestion: (suggestion) => {
        input.value = suggestion.gameTitle;
        return true;
      },
    };
  }

  const select = el('select', 'gl-select') as HTMLSelectElement;
  const placeholder = el('option', undefined, 'ゲームを選択');
  placeholder.value = '';
  select.appendChild(placeholder);
  for (const game of active) {
    const option = el('option', undefined, game.team ? `${game.title} (${game.team})` : game.title);
    option.value = game.id;
    select.appendChild(option);
  }
  return {
    element: select,
    read: () => {
      const game = active.find((candidate) => candidate.id === select.value);
      // タイトルは Volputas 側でマスタの値に上書きされる。 ここで送るのは
      // 送信前バリデーション (空でないこと) を成立させるための値。
      return { gameId: game?.id ?? null, gameTitle: game?.title ?? '' };
    },
    reset: () => { select.value = ''; },
    selectSuggestion: (suggestion) => {
      const game = active.find((candidate) => (
        candidate.id === suggestion.gameId
        || candidate.title.localeCompare(suggestion.gameTitle, undefined, { sensitivity: 'accent' }) === 0
      ));
      if (!game) return false;
      select.value = game.id;
      return true;
    },
  };
}

/** 管理者だけに出るゲームマスタの登録・停止セクション。 */
export async function createGameAdminSection(
  ctx: PanelContext,
  onChange: () => void,
): Promise<HTMLElement> {
  const section = el('section', 'gl-game-admin');
  section.appendChild(el('h3', undefined, '🎮 ゲーム管理 (管理者)'));

  const list = el('div', 'gl-game-list');
  const games = await loadGames(ctx, { includeInactive: true });
  if (!games) {
    list.appendChild(el('p', 'gl-muted', 'ゲーム一覧を取得できませんでした。'));
  } else if (games.length === 0) {
    list.appendChild(el('p', 'gl-muted', 'まだゲームが登録されていません。'));
  } else {
    for (const game of games) list.appendChild(gameRow(ctx, game, onChange));
  }
  section.appendChild(list);
  section.appendChild(registrationForm(ctx, onChange));
  return section;
}

function gameRow(ctx: PanelContext, game: GameView, onChange: () => void): HTMLElement {
  const row = el('div', 'gl-game-row');
  const summary = el('div', 'gl-row');
  summary.append(
    el('strong', undefined, game.title),
    el('span', 'gl-muted', [game.team, game.platform].filter(Boolean).join(' / ')),
    el('span', `gl-tag ${game.isActive ? 'open' : 'closed'}`, game.isActive ? '受付中' : '停止中'),
  );
  const toggle = el('button', 'gl-btn ghost', game.isActive ? '受付を停止' : '受付を再開');
  toggle.type = 'button';
  toggle.onclick = () => {
    toggle.disabled = true;
    void ctx.api(`/games/${encodeURIComponent(game.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: !game.isActive }),
    }).then(onChange).catch(() => { toggle.disabled = false; });
  };
  summary.appendChild(toggle);
  row.append(summary, steamUrlEditor(ctx, game, onChange));
  return row;
}

function steamUrlEditor(ctx: PanelContext, game: GameView, onChange: () => void): HTMLElement {
  const form = el('form', 'gl-row gl-steam-url-form');
  const input = el('input', 'gl-input') as HTMLInputElement;
  input.type = 'url';
  input.placeholder = 'SteamストアURL（最近の流行り集計に使用）';
  input.value = game.storeUrl ?? '';
  const message = el('small', 'gl-muted');
  const save = el('button', 'gl-btn ghost', 'Steam URLを保存');
  save.type = 'submit';
  form.append(input, save, message);
  form.onsubmit = (event) => {
    event.preventDefault();
    const storeUrl = input.value.trim();
    if (storeUrl && steamAppIdFromStoreUrl(storeUrl) === null) {
      message.textContent = 'HTTPS の Steam ゲーム詳細 URL を入力してください。';
      return;
    }
    save.disabled = true;
    message.textContent = '保存中…';
    void ctx.api(`/games/${encodeURIComponent(game.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeUrl: storeUrl || null }),
    }).then((response) => {
      save.disabled = false;
      if (!response.ok) {
        message.textContent = `保存できませんでした (${response.status})。`;
        return;
      }
      message.textContent = '保存しました。';
      onChange();
    }).catch(() => {
      save.disabled = false;
      message.textContent = '保存できませんでした。';
    });
  };
  return form;
}

function registrationForm(ctx: PanelContext, onChange: () => void): HTMLElement {
  const form = el('form', 'gl-game-form');
  const title = el('input', 'gl-input') as HTMLInputElement;
  title.placeholder = 'ゲーム名 (必須)';
  title.required = true;
  const team = el('input', 'gl-input') as HTMLInputElement;
  team.placeholder = '制作チーム';
  const platform = el('input', 'gl-input') as HTMLInputElement;
  platform.placeholder = 'プレイ環境 (PC / Quest など)';
  const storeUrl = el('input', 'gl-input') as HTMLInputElement;
  storeUrl.type = 'url';
  storeUrl.placeholder = 'SteamストアURL（任意）';
  const message = el('p', 'gl-muted');
  const submit = el('button', 'gl-btn', 'ゲームを登録');
  submit.type = 'submit';
  form.append(title, team, platform, storeUrl, message, submit);

  form.onsubmit = (event) => {
    event.preventDefault();
    const name = title.value.trim();
    if (!name) {
      message.textContent = 'ゲーム名を入力してください。';
      return;
    }
    const storeUrlValue = storeUrl.value.trim();
    if (storeUrlValue && steamAppIdFromStoreUrl(storeUrlValue) === null) {
      message.textContent = 'HTTPS の Steam ゲーム詳細 URL を入力してください。';
      return;
    }
    submit.disabled = true;
    message.textContent = '登録中…';
    void ctx.api('/games', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: name,
        team: team.value.trim() || null,
        platform: platform.value.trim() || null,
        storeUrl: storeUrlValue || null,
      }),
    }).then(async (response) => {
      submit.disabled = false;
      if (response.ok) {
        message.textContent = '登録しました。';
        title.value = '';
        team.value = '';
        platform.value = '';
        storeUrl.value = '';
        onChange();
        return;
      }
      // 重複と権限不足は運用でふつうに起きるので、 理由を出し分ける。
      message.textContent = response.status === 409
        ? '同じ名前のゲームが既に登録されています。'
        : response.status === 403
          ? '登録は管理者のみです (Cernere 側の権限も必要です)。'
          : `登録できませんでした (${response.status})。`;
    }).catch(() => {
      submit.disabled = false;
      message.textContent = '登録できませんでした。';
    });
  };
  return form;
}
