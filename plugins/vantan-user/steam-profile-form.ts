import type { PanelContext } from '../../corpus/public/src/types.ts';
import type { SteamProfile } from './steam-profile-schema.ts';

export interface SteamProfileFields {
  element: HTMLElement;
  read(): SteamProfile | undefined;
}

/** Shared by the optional setup step and the owner's profile editor. */
export function steamProfileFields(ctx: PanelContext): SteamProfileFields {
  const element = document.createElement('section');
  const heading = document.createElement('h3');
  heading.textContent = 'Steam連携（任意）';
  const fields = document.createElement('fieldset');
  fields.className = 'gl-profile-form';
  fields.disabled = true;
  const idLabel = document.createElement('label');
  idLabel.className = 'gl-profile-field';
  idLabel.textContent = 'Steam ID（SteamID64・17桁の数字）';
  const steamId = document.createElement('input');
  steamId.className = 'gl-input';
  steamId.type = 'text';
  steamId.inputMode = 'numeric';
  steamId.pattern = '[0-9]{17}';
  steamId.maxLength = 17;
  steamId.autocomplete = 'off';
  steamId.placeholder = '未入力でも利用できます';
  idLabel.append(steamId);
  const games = checkbox('遊んだゲームの情報を公開する');
  const id = checkbox('Steam IDを公開する');
  const description = document.createElement('p');
  description.className = 'gl-muted';
  description.textContent = '公開設定はそれぞれ独立しています。未チェックの情報は非公開です。あとからプロフィールで変更できます。Steam側の公開設定は変更されません。';
  fields.append(idLabel, games.label, id.label, description);
  const status = document.createElement('p');
  status.className = 'gl-muted';
  status.setAttribute('role', 'status');
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'gl-btn ghost';
  retry.textContent = 'Steam設定を再読み込み';
  retry.hidden = true;
  element.append(heading, fields, status, retry);
  let loaded = false;

  const load = async (): Promise<void> => {
    loaded = false;
    fields.disabled = true;
    retry.hidden = true;
    status.textContent = 'Steam設定を読み込み中…';
    try {
      const response = await ctx.hubApi('/api/x/vantan-user/steam-profile');
      const body: unknown = await response.json();
      if (!response.ok || !isProfileResponse(body)) throw new Error('Unavailable');
      steamId.value = body.profile.steamId ?? '';
      games.input.checked = body.profile.playedGamesPublic;
      id.input.checked = body.profile.steamIdPublic;
      loaded = true;
      fields.disabled = false;
      status.textContent = '';
    } catch {
      status.textContent = 'Steam設定を取得できません。Steam設定を変更せずに初回登録を進めることはできます。設定する場合は再読み込みしてください。';
      retry.hidden = false;
    }
  };
  retry.onclick = () => { void load(); };
  void load();
  return {
    element,
    read: () => loaded ? {
      steamId: steamId.value.trim() || null,
      playedGamesPublic: games.input.checked,
      steamIdPublic: id.input.checked,
    } : undefined,
  };
}

function checkbox(text: string): { label: HTMLLabelElement; input: HTMLInputElement } {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = false;
  label.append(input, document.createTextNode(' ' + text));
  return { label, input };
}

function isProfileResponse(value: unknown): value is { profile: SteamProfile } {
  if (!value || typeof value !== 'object' || !('profile' in value)) return false;
  const profile = value.profile;
  if (!profile || typeof profile !== 'object') return false;
  return 'steamId' in profile && (profile.steamId === null
      || (typeof profile.steamId === 'string' && /^[0-9]{17}$/.test(profile.steamId)))
    && 'playedGamesPublic' in profile && typeof profile.playedGamesPublic === 'boolean'
    && 'steamIdPublic' in profile && typeof profile.steamIdPublic === 'boolean';
}
