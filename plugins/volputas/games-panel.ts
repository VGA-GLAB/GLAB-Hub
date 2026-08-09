import { el, type PanelContext } from '../panel-kit.ts';
import { parseGameList, type GameView } from './contracts.ts';

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
  const row = el('div', 'gl-row gl-game-row');
  row.append(
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
  row.appendChild(toggle);
  return row;
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
  const message = el('p', 'gl-muted');
  const submit = el('button', 'gl-btn', 'ゲームを登録');
  submit.type = 'submit';
  form.append(title, team, platform, message, submit);

  form.onsubmit = (event) => {
    event.preventDefault();
    const name = title.value.trim();
    if (!name) {
      message.textContent = 'ゲーム名を入力してください。';
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
      }),
    }).then(async (response) => {
      submit.disabled = false;
      if (response.ok) {
        message.textContent = '登録しました。';
        title.value = '';
        team.value = '';
        platform.value = '';
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
