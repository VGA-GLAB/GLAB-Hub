// 視聴画面。 映像 (<video>)・視聴者数・投票・リアクション 3 領域を組み立てる。
//
// リアクションは neco 指示 (2026-10-04) どおり 3 つに分ける:
//   グッド   — 画面で最も大きいボタン。 押すたびに即時の手応え、 送信は 200ms まとめ。
//   スタンプ — グッドとは別の列の小さめのボタン。
//   コメント — 任意文字列 (≤280) の入力欄 + 送信。 スタンプ列とは分ける。
// ダッシュボードと odeum パネルの両方から使うので、 API は hubApi で絶対パスを叩く。

import { el, type PanelContext } from '../panel-kit.ts';
import { GoodBatcher } from './good-batcher.ts';
import { ensureOdeumStyles } from './styles.ts';
import { OdeumViewerConnection } from './viewer-connection.ts';
import {
  MAX_COMMENT_LENGTH,
  STAMP_KINDS,
  normalizeComment,
  type ServerMessage,
  type StampKind,
} from './viewer-protocol.ts';

const STAMP_LABEL: Record<StampKind, string> = {
  clap: '👏 拍手',
  laugh: '😂 笑',
  wow: '😮 おお',
  question: '❓ 質問',
  agree: '🙆 同意',
};

interface ViewerTicket {
  wsUrl: string;
  ticket: string;
  eventTitle: string;
  self: { sub: string; name: string };
}

export interface ViewerHandle {
  dispose(): void;
}

export function mountViewer(
  container: HTMLElement,
  ctx: PanelContext,
  sessionId: string,
  onLeave: () => void,
): ViewerHandle {
  ensureOdeumStyles();
  let connection: OdeumViewerConnection | null = null;
  let batcher: GoodBatcher | null = null;
  let decayTimer: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const root = el('div', 'od-viewer');
  container.innerHTML = '';
  container.appendChild(root);

  const teardown = (): void => {
    batcher?.dispose();
    batcher = null;
    connection?.close();
    connection = null;
    if (decayTimer != null) clearInterval(decayTimer);
    decayTimer = null;
  };

  const dispose = (): void => {
    disposed = true;
    teardown();
    root.remove();
  };

  const connect = async (): Promise<void> => {
    teardown();
    root.innerHTML = '';
    root.appendChild(el('p', 'gl-muted', '接続しています…'));
    let ticket: ViewerTicket;
    try {
      const response = await ctx.hubApi(`/api/x/odeum/sessions/${encodeURIComponent(sessionId)}/viewer-ticket`, {
        method: 'POST',
      });
      if (!response.ok) {
        root.innerHTML = '';
        root.appendChild(el('p', 'gl-notice gl-notice-error', response.status === 503
          ? 'ライブ発表の中継が設定されていないため視聴できません。'
          : 'この発表は終了したか、視聴できません。'));
        root.appendChild(leaveButton());
        return;
      }
      ticket = await response.json() as ViewerTicket;
    } catch {
      root.innerHTML = '';
      root.appendChild(el('p', 'gl-notice gl-notice-error', '視聴の準備に失敗しました。'));
      root.appendChild(leaveButton());
      return;
    }
    if (disposed) return;
    build(ticket);
  };

  const leaveButton = (): HTMLButtonElement => {
    const button = el('button', 'gl-btn ghost', '閉じる');
    button.type = 'button';
    button.onclick = () => {
      dispose();
      onLeave();
    };
    return button;
  };

  const build = (ticket: ViewerTicket): void => {
    root.innerHTML = '';
    const head = el('div', 'od-viewer-head');
    head.appendChild(el('strong', 'od-viewer-title', ticket.eventTitle));
    const presence = el('span', 'gl-muted od-presence', '発表者の接続を待っています');
    head.append(presence, leaveButton());
    root.appendChild(head);

    const video = el('video', 'od-video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    const sound = el('button', 'gl-btn ghost od-sound', '🔈 音声を出す');
    sound.type = 'button';
    sound.onclick = () => {
      video.muted = !video.muted;
      sound.textContent = video.muted ? '🔈 音声を出す' : '🔇 消音する';
      void video.play().catch(() => undefined);
    };
    const stage = el('div', 'od-stage');
    stage.append(video, sound);
    root.appendChild(stage);

    // みんなのグッドの盛り上がり (reaction.burst の集計)。
    const burst = el('div', 'od-burst');
    const burstLabel = el('span', 'od-burst-label', 'みんなのグッド 0');
    const meter = el('div', 'od-meter');
    const meterFill = el('div', 'od-meter-fill');
    meter.appendChild(meterFill);
    const stampTally = el('span', 'gl-muted od-burst-stamps');
    burst.append(burstLabel, meter, stampTally);
    root.appendChild(burst);

    const pollArea = el('div', 'od-poll');
    root.appendChild(pollArea);

    const notice = el('p', 'od-notice');
    notice.setAttribute('role', 'status');

    // ── リアクション 3 領域 ──
    const reactions = el('div', 'od-reactions');

    const goodArea = el('div', 'od-good-area');
    const good = el('button', 'od-good');
    good.type = 'button';
    good.setAttribute('aria-label', 'グッド');
    good.appendChild(el('span', 'od-good-icon', '👍'));
    good.appendChild(el('span', 'od-good-text', 'グッド'));
    const mine = el('span', 'od-good-mine', '0');
    good.appendChild(mine);
    goodArea.appendChild(good);

    const stampArea = el('div', 'od-stamps');
    stampArea.setAttribute('aria-label', 'スタンプ');
    for (const kind of STAMP_KINDS) {
      const button = el('button', 'gl-btn ghost od-stamp', STAMP_LABEL[kind]);
      button.type = 'button';
      button.onclick = () => connection?.sendStamp(kind);
      stampArea.appendChild(button);
    }

    const commentArea = el('form', 'od-comment');
    const commentInput = el('input', 'gl-input od-comment-input');
    commentInput.maxLength = MAX_COMMENT_LENGTH;
    commentInput.placeholder = `コメント (${MAX_COMMENT_LENGTH} 文字まで)`;
    const commentSend = el('button', 'gl-btn', '送信');
    commentSend.type = 'submit';
    commentArea.append(commentInput, commentSend);
    commentArea.onsubmit = (event) => {
      event.preventDefault();
      const text = normalizeComment(commentInput.value);
      if (!text || !connection) return;
      connection.sendComment(text);
      commentInput.value = '';
    };

    reactions.append(goodArea, stampArea, commentArea);
    root.append(reactions, notice);

    let level = 0;
    let crowdGood = 0;
    decayTimer = setInterval(() => {
      level *= 0.7;
      meterFill.style.width = `${Math.min(100, level * 4)}%`;
    }, 250);

    let noticeTimer: ReturnType<typeof setTimeout> | null = null;
    const showNotice = (text: string): void => {
      notice.textContent = text;
      if (noticeTimer != null) clearTimeout(noticeTimer);
      noticeTimer = setTimeout(() => { notice.textContent = ''; }, 2_500);
    };

    const pollView = renderPoll(pollArea, (pollId, choices) => connection?.answerPoll(pollId, choices));

    const handle = (message: ServerMessage): void => {
      switch (message.type) {
        case 'presence':
          presence.textContent = message.presenter_connected
            ? `配信中 · 視聴者 ${message.viewer_count} 人`
            : `発表者の接続待ち · 視聴者 ${message.viewer_count} 人`;
          break;
        case 'reaction.burst': {
          crowdGood += message.good;
          level += message.good;
          burstLabel.textContent = `みんなのグッド ${crowdGood}`;
          const stamps = Object.entries(message.stamps ?? {})
            .filter(([, n]) => (n ?? 0) > 0)
            .map(([kind, n]) => `${STAMP_LABEL[kind as StampKind]?.split(' ')[0] ?? kind}×${n}`);
          stampTally.textContent = stamps.join(' ');
          break;
        }
        case 'poll.open':
          pollView.open(message.poll_id, message.question, message.choices, message.multi);
          break;
        case 'tally':
          pollView.tally(message.poll_id, message.counts, message.answered);
          break;
        case 'poll.closed':
          pollView.close(message.poll_id, message.tally ?? null);
          break;
        case 'error':
          // 流量制限は控えめに知らせる。 その他もメッセージ本文は出さず定型文にする。
          showNotice(message.code === 'rate_limited'
            ? '少し間をおいてから送ってください'
            : '送信できませんでした');
          break;
        default:
          break;
      }
    };

    connection = new OdeumViewerConnection(ticket.wsUrl, ticket.ticket, {
      onMessage: handle,
      onStream: (stream) => {
        video.srcObject = stream;
        void video.play().catch(() => undefined);
      },
      onClose: () => {
        if (disposed) return;
        presence.textContent = '中継との接続が切れました';
        batcher?.dispose();
        batcher = null;
        const retry = el('button', 'gl-btn', '再接続');
        retry.type = 'button';
        retry.onclick = () => void connect();
        head.insertBefore(retry, head.lastChild);
      },
    });
    const activeConnection = connection;
    batcher = new GoodBatcher((count) => activeConnection.sendGood(count));

    // グッド: クリック (タップ) 1 回 = 1 件。 長押しのキーリピートは連打扱いにしない。
    good.onclick = () => {
      if (!batcher) return;
      mine.textContent = String(batcher.press());
      good.classList.remove('od-pop');
      void good.offsetWidth;
      good.classList.add('od-pop');
    };
    good.onkeydown = (event) => {
      if (event.repeat) event.preventDefault();
    };
    good.oncontextmenu = (event) => event.preventDefault();
  };

  void connect();
  return { dispose };
}

interface PollView {
  open(pollId: string, question: string, choices: string[], multi: boolean): void;
  tally(pollId: string, counts: number[], answered: number): void;
  close(pollId: string, tally: number[] | null): void;
}

function renderPoll(area: HTMLElement, answer: (pollId: string, choices: number[]) => void): PollView {
  let current: { id: string; counts: HTMLElement[]; answered: HTMLElement; inputs: HTMLInputElement[]; submit: HTMLButtonElement } | null = null;

  const setCounts = (counts: number[]): void => {
    current?.counts.forEach((cell, index) => { cell.textContent = String(counts[index] ?? 0); });
  };

  return {
    open(pollId, question, choices, multi) {
      area.innerHTML = '';
      const box = el('div', 'gl-notice od-poll-box');
      box.appendChild(el('strong', undefined, `📊 ${question}`));
      const list = el('div', 'od-poll-choices');
      const inputs: HTMLInputElement[] = [];
      const counts: HTMLElement[] = [];
      choices.forEach((choice, index) => {
        const label = el('label', 'od-poll-choice');
        const input = el('input');
        input.type = multi ? 'checkbox' : 'radio';
        input.name = `od-poll-${pollId}`;
        input.value = String(index);
        const count = el('span', 'gl-tag', '0');
        label.append(input, ` ${choice} `, count);
        list.appendChild(label);
        inputs.push(input);
        counts.push(count);
      });
      const submit = el('button', 'gl-btn', '回答する');
      submit.type = 'button';
      const answered = el('span', 'gl-muted', '');
      submit.onclick = () => {
        const picked = inputs.filter((input) => input.checked).map((input) => Number(input.value));
        if (picked.length === 0) return;
        answer(pollId, picked);
        submit.textContent = '回答を更新';
      };
      box.append(list, submit, answered);
      area.appendChild(box);
      current = { id: pollId, counts, answered, inputs, submit };
    },
    tally(pollId, counts, answeredCount) {
      if (current?.id !== pollId) return;
      setCounts(counts);
      current.answered.textContent = ` 回答 ${answeredCount} 人`;
    },
    close(pollId, tally) {
      if (current?.id !== pollId) return;
      if (tally) setCounts(tally);
      current.inputs.forEach((input) => { input.disabled = true; });
      current.submit.disabled = true;
      current.submit.textContent = '投票は締め切られました';
    },
  };
}
