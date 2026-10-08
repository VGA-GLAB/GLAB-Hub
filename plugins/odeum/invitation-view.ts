// 発表の運営者向け「参加 QR / OBS」表示 (frontend)。
// 参加コードと QR は会場で見せる前提で表示し、 OBS 用 URL は credential なので
// 押したときだけ出してコピーさせる。 値は textContent / img.src でのみ入れる。

import { el, type PanelContext } from '../panel-kit.ts';
import { ensureOdeumStyles } from './styles.ts';

interface InvitationResponse {
  joinCode: string;
  joinUrl: string;
  joinQr: string;
  overlayUrl: string;
}

function isInvitation(value: unknown): value is InvitationResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.joinCode === 'string' && typeof v.joinUrl === 'string'
    && typeof v.overlayUrl === 'string' && typeof v.joinQr === 'string' && v.joinQr.startsWith('data:image/png;base64,');
}

async function copy(text: string, button: HTMLButtonElement): Promise<void> {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'コピーしました';
  } catch {
    button.textContent = 'コピーできませんでした';
  }
  setTimeout(() => { button.textContent = label; }, 2000);
}

function renderInvitation(body: InvitationResponse): HTMLElement {
  const box = el('div', 'od-invite');
  const qr = el('img', 'od-invite-qr');
  qr.src = body.joinQr;
  qr.alt = '参加用 QR コード';
  qr.width = 240;
  qr.height = 240;

  const info = el('div', 'od-invite-info');
  info.append(
    el('div', 'gl-muted', '同じ Wi-Fi のスマホで読み取ると、ログインなしでリアクションできます。'),
    el('div', 'od-invite-code', body.joinCode),
    el('div', 'gl-muted od-invite-url', body.joinUrl),
  );

  const overlay = el('div', 'od-invite-overlay');
  const reveal = el('button', 'gl-btn ghost', 'OBS 用 URL を表示');
  reveal.type = 'button';
  reveal.onclick = () => {
    const url = el('code', 'od-invite-url', body.overlayUrl);
    const copyButton = el('button', 'gl-btn ghost', 'コピー');
    copyButton.type = 'button';
    copyButton.onclick = () => { void copy(body.overlayUrl, copyButton); };
    overlay.replaceChildren(
      el('div', 'gl-muted', 'OBS の「ブラウザ」ソース (1920x1080) に貼り、番組シーンの最前面に置きます。画面共有しないでください。'),
      url,
      copyButton,
    );
  };
  overlay.append(reveal);
  info.append(overlay);
  box.append(qr, info);
  return box;
}

/** 「参加 QR / OBS」ボタン。 押すと招待を取得して下に展開する。 */
export function invitationToggle(ctx: PanelContext, sessionId: string): HTMLElement {
  ensureOdeumStyles();
  const wrap = el('div', 'od-invite-wrap');
  const button = el('button', 'gl-btn ghost', '参加 QR / OBS');
  button.type = 'button';
  const area = el('div');
  button.onclick = () => {
    if (area.childElementCount > 0) { area.replaceChildren(); return; }
    button.disabled = true;
    void ctx.hubApi(`/api/x/odeum/sessions/${encodeURIComponent(sessionId)}/invitation`)
      .then(async (response) => {
        const body: unknown = response.ok ? await response.json() : null;
        area.replaceChildren(isInvitation(body)
          ? renderInvitation(body)
          : el('span', 'gl-muted', `参加情報を取得できませんでした (${response.status})。`));
      })
      .catch(() => { area.replaceChildren(el('span', 'gl-muted', '参加情報を取得できませんでした。')); })
      .finally(() => { button.disabled = false; });
  };
  wrap.append(button, area);
  return wrap;
}
