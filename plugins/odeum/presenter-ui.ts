import { el, type PanelContext } from '../panel-kit.ts';
import { OdeumPresenterConnection } from './presenter-connection.ts';

interface PresenterTicket {
  wsUrl: string;
  ticket: string;
  resumed: boolean;
  session: { id: string };
}

/** Called synchronously from a click: capture requires transient user activation. */
export function startScreenPresentation(ctx: PanelContext, input: { eventId: number } | { title: string }): void {
  // Event/dashboard panels are separate bundles; a DOM owner also prevents cross-bundle duplicates.
  const existing = document.getElementById('odeum-screen-presenter');
  if (existing) { existing.focus(); return; }
  const root = el('section', 'gl-notice');
  root.id = 'odeum-screen-presenter';
  root.tabIndex = -1;
  root.setAttribute('aria-label', '画面配信');
  Object.assign(root.style, { position: 'fixed', bottom: '16px', right: '16px', zIndex: '10000',
    maxWidth: 'min(420px, 90vw)', background: 'var(--gl-bg, #fff)', color: 'var(--gl-fg, #222)', padding: '16px' });
  const status = el('p', undefined, '共有する画面を選んでください。');
  status.setAttribute('role', 'status');
  const stop = el('button', 'gl-btn', 'キャンセル');
  stop.type = 'button';
  root.append(el('strong', undefined, 'このPCの画面配信'), status, stop);
  document.body.appendChild(root);
  let closed = false;
  let stream: MediaStream | null = null;
  let connection: OdeumPresenterConnection | null = null;
  let ticket: PresenterTicket | null = null;
  let connected = false;
  let ending = false;

  const endLedger = async (): Promise<void> => {
    // A failed attempt to resume must not end an already-running presenter in another tab.
    if (!ticket || ending || (ticket.resumed && !connected)) return;
    ending = true;
    try {
      const response = await ctx.hubApi(`/api/x/odeum/sessions/${encodeURIComponent(ticket.session.id)}/end`, { method: 'POST' });
      if (!response.ok) throw new Error('end_failed');
    } catch {
      ending = false;
      status.textContent += ' 配信一覧の終了処理に失敗しました。配信一覧から「配信を終了」を押してください。';
    }
  };
  const halt = (): void => {
    closed = true;
    connection?.close();
    connection = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('odeum-session-ended', onSessionEnded);
  };
  const finish = (message: string): void => {
    halt();
    status.textContent = message;
    stop.textContent = '閉じる';
    void endLedger();
  };
  const onPageHide = (): void => { finish('配信を停止しました。'); };
  const onSessionEnded = (event: Event): void => {
    if ((event as CustomEvent<unknown>).detail !== ticket?.session.id) return;
    ending = true;
    finish('配信を終了しました。');
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('odeum-session-ended', onSessionEnded);
  stop.onclick = () => {
    if (closed) { root.remove(); return; }
    finish('配信を停止しました。');
  };
  if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
    finish('このブラウザでは画面を共有できません。PCの対応ブラウザでHTTPSのGLabを開いてください。');
    return;
  }

  // No network await before this call; cancelling the picker creates no session.
  const capture = navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
    audio: true,
  });
  void capture.then(async (selected) => {
    if (closed) { selected.getTracks().forEach((track) => track.stop()); return; }
    stream = selected;
    const video = selected.getVideoTracks()[0];
    if (!video || video.readyState !== 'live') throw new Error('共有する画面が選ばれていません。');
    video.addEventListener('ended', () => {
      if (!closed) finish('画面共有を停止しました。');
    }, { once: true });
    status.textContent = '中継に接続しています…';
    stop.textContent = '配信停止';
    const response = await ctx.hubApi('/api/x/odeum/sessions', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error(response.status === 409 ? '別の人がこのイベントで配信中です。'
      : response.status === 403 ? 'このイベントで配信する権限がありません。' : '配信の準備に失敗しました。');
    ticket = await response.json() as PresenterTicket;
    if (closed) { await endLedger(); return; }
    connection = new OdeumPresenterConnection(ticket.wsUrl, ticket.ticket, selected, {
      onConnected: () => {
        connected = true;
        status.textContent = selected.getAudioTracks().length
          ? '配信中です。選んだ画面と共有音声を送っています。'
          : '配信中です。選んだ画面を送っています（音声なし）。';
      },
      onEnded: finish,
    });
  }).catch((error: unknown) => {
    if (closed) return;
    finish(error instanceof DOMException && error.name === 'NotAllowedError'
      ? '画面共有をキャンセルしたか、共有が許可されませんでした。'
      : error instanceof Error ? error.message : '画面配信を開始できませんでした。');
  });
}
