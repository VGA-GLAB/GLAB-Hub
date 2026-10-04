/**
 * 「GPS で出席」 (契約 G2): 位置取得 → 写真撮影 → 送信 → 結果表示。
 * Os の宣言は GLAB のサーバ側で添えるので、 ブラウザは GLAB にだけ送る。
 */

import { el, section, type PanelContext } from '../panel-kit.ts';
import {
  geolocationMessage,
  geolocationUnsupportedMessage,
  gpsCheckinMessage,
} from './gps-checkin-messages.ts';

interface Position {
  lat: number;
  lon: number;
  accuracyM: number;
  positionAt: number;
}

const POSITION_TIMEOUT_MS = 20_000;

export function gpsCheckinSection(
  available: boolean,
  ctx: PanelContext,
  rerender: () => Promise<void>,
): HTMLElement {
  const gps = section('GPS で出席');
  const message = el('p', 'gl-muted');
  const unsupported = geolocationUnsupportedMessage();
  if (unsupported) {
    message.textContent = unsupported;
    gps.body.append(message);
    return gps.wrap;
  }
  if (!available) {
    message.textContent = '会場の位置情報 (Os) を取得できないため、現在は GPS で出席できません。';
    gps.body.append(message);
    return gps.wrap;
  }

  gps.body.append(el('p', 'gl-muted', '会場にいることを位置情報で確認し、その場で撮った写真を 1 枚添えて出席します。'));
  const photo = el('input');
  photo.type = 'file';
  photo.accept = 'image/*';
  photo.setAttribute('capture', 'environment');
  photo.hidden = true;

  let position: Position | null = null;
  const locate = el('button', 'gl-btn', '① 位置を取得');
  locate.type = 'button';
  const shoot = el('button', 'gl-btn', '② 写真を撮って送信');
  shoot.type = 'button';
  shoot.disabled = true;

  locate.onclick = () => {
    locate.disabled = true;
    message.textContent = '位置を取得中…';
    void currentPosition().then((value) => {
      position = value;
      message.textContent = `位置を取得しました (精度 約${Math.round(value.accuracyM)} m)。写真を撮って送信してください。`;
      shoot.disabled = false;
    }).catch((error: unknown) => {
      message.textContent = isGeolocationError(error) ? geolocationMessage(error) : '位置を取得できませんでした。';
    }).finally(() => { locate.disabled = false; });
  };
  shoot.onclick = () => photo.click();
  photo.onchange = () => {
    const file = photo.files?.[0];
    photo.value = '';
    if (!file || !position) return;
    shoot.disabled = true;
    message.textContent = '送信中…';
    void submit(ctx, position, file).then(async (result) => {
      message.textContent = result;
      position = null;
      await rerender();
    }).catch((error: unknown) => {
      message.textContent = error instanceof Error ? error.message : String(error);
      shoot.disabled = false;
    });
  };

  const buttons = el('div', 'gl-row');
  buttons.append(locate, shoot);
  gps.body.append(buttons, message, photo);
  return gps.wrap;
}

function currentPosition(): Promise<Position> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (value) => resolve({
        lat: value.coords.latitude,
        lon: value.coords.longitude,
        accuracyM: value.coords.accuracy,
        positionAt: value.timestamp,
      }),
      reject,
      { enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}

function isGeolocationError(error: unknown): error is GeolocationPositionError {
  return typeof error === 'object' && error !== null && 'code' in error && 'PERMISSION_DENIED' in error;
}

async function submit(ctx: PanelContext, position: Position, photo: File): Promise<string> {
  const form = new FormData();
  form.set('lat', String(position.lat));
  form.set('lon', String(position.lon));
  form.set('accuracyM', String(position.accuracyM));
  form.set('positionAt', String(Math.round(position.positionAt)));
  form.set('photo', photo, photo.name || 'photo.jpg');
  const response = await ctx.api('/checkin/gps', { method: 'POST', body: form });
  const body = await response.json().catch(() => null) as {
    error?: string; alreadyCheckedIn?: boolean; photoStored?: boolean;
  } | null;
  if (!response.ok) throw new Error(gpsCheckinMessage(body?.error, response.status));
  const head = body?.alreadyCheckedIn ? '本日の出席は既に記録されています。' : 'GPS で出席を記録しました。';
  return body?.photoStored === false ? `${head} (写真の保存に失敗しました)` : head;
}
