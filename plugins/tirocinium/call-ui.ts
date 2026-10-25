import { el, section, type PanelContext } from '../panel-kit.ts';
import { CallAudio } from './call-audio.ts';

/** Explicit start, no automatic reconnect, one bounded sequential upload pipeline. */
export function mountCall(container: HTMLElement, ctx: PanelContext): void {
  const card = section('Tirociniumと音声で面接練習');
  const status = el('p', 'gl-muted', '通話を開始するとマイクを使って会話できます。');
  status.setAttribute('role', 'status');
  const start = el('button', 'gl-btn', '通話を開始');
  const mute = el('button', 'gl-btn ghost', 'ミュート');
  const interrupt = el('button', 'gl-btn ghost', '割り込む');
  const end = el('button', 'gl-btn ghost', '通話を終了');
  for (const button of [start, mute, interrupt, end]) button.type = 'button';
  const text = el('p'); text.setAttribute('aria-live', 'polite');
  card.body.append(status, start, mute, interrupt, end, text);
  container.append(card.wrap);
  let audio: CallAudio | null = null;
  let callId: string | null = null;
  let abort: AbortController | null = null;
  let running = false;
  let stopped = true;
  let queue: Record<string, unknown>[] = [];
  let uploading = false;
  let seq = 0;
  let generation = 0;
  let uploadTimer: ReturnType<typeof setTimeout> | null = null;
  let currentTurn = -1;
  let ignoredTurn = -1;
  const controls = (): void => {
    start.disabled = running;
    mute.disabled = interrupt.disabled = !running || !callId;
    end.disabled = !running;
  };
  controls();
  const stop = async (message = '通話を終了しました。'): Promise<void> => {
    if (stopped) return;
    stopped = true; running = false; generation++;
    abort?.abort(); abort = null;
    queue = [];
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = null;
    const old = audio; audio = null;
    // Tracks are stopped synchronously inside stop, before awaiting context.close.
    const closingAudio = old?.stop();
    const id = callId; callId = null;
    controls(); status.textContent = message;
    if (id) {
      try { await ctx.api(`/calls/${encodeURIComponent(id)}`, { method: 'DELETE', keepalive: true }); }
      catch { status.textContent = `${message} 接続先の終了確認はできませんでした。`; }
    }
    await closingAudio;
  };
  const upload = async (): Promise<void> => {
    if (uploading || !callId || stopped) return;
    uploading = true;
    const activeGeneration = generation;
    try {
      while (queue.length && callId && !stopped && activeGeneration === generation) {
        const frame = queue.shift()!;
        if (frame.kind === 'audio_chunk') frame.seq = seq++;
        const response = await ctx.api(`/calls/${encodeURIComponent(callId)}/frames`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(frame),
          signal: abort?.signal,
        });
        if (!response.ok) throw new Error('音声を送信できませんでした。');
      }
    } catch {
      if (!stopped && activeGeneration === generation) await stop('通話の送信が止まりました。もう一度開始してください。');
    } finally {
      uploading = false;
      if (queue.length && !stopped) void upload();
    }
  };
  const enqueue = (frame: Record<string, unknown>): void => {
    if (!callId || stopped) return;
    const tail = queue[queue.length - 1];
    if (frame.kind === 'audio_chunk' && tail?.kind === 'audio_chunk'
      && (tail.pcm as number[]).length + (frame.pcm as number[]).length <= 8000) {
      (tail.pcm as number[]).push(...frame.pcm as number[]); return;
    }
    if (queue.length >= 8) { void stop('音声の送信が遅れたため通話を終了しました。'); return; }
    queue.push(frame);
    if (frame.kind !== 'audio_chunk') { void upload(); return; }
    // Aggregate 50ms worklet chunks into up to 250ms HTTP batches for WAN RTT.
    if (!uploadTimer) uploadTimer = setTimeout(() => { uploadTimer = null; void upload(); }, 250);
  };
  const readEvents = async (response: Response, activeGeneration: number): Promise<void> => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('音声応答を受信できません。');
    const decoder = new TextDecoder(); let pending = ''; let responseText = '';
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        if (stopped || generation !== activeGeneration) break;
        pending += decoder.decode(next.value, { stream: true });
        if (pending.length > 8 * 1024 * 1024) throw new Error('音声応答が大きすぎます。');
        let split: number;
        while ((split = pending.indexOf('\n\n')) >= 0) {
          const event = pending.slice(0, split); pending = pending.slice(split + 2);
          if (!event.startsWith('data: ')) continue;
          const frame = JSON.parse(event.slice(6)) as Record<string, unknown>;
          if (typeof frame.turn_no === 'number') currentTurn = Math.max(currentTurn, frame.turn_no);
          if (frame.kind === 'response_token') {
            responseText = (responseText + String(frame.token ?? '')).slice(-5000); text.textContent = responseText;
          } else if (frame.kind === 'response_end') responseText = '';
          else if (frame.kind === 'tts_chunk' && Number(frame.turn_no) > ignoredTurn) {
            audio?.play(frame.pcm as number[], Number(frame.sample_rate), Number(frame.channels));
          }
          else if (frame.kind === 'system' && frame.code === 'closing') { await stop(); return; }
          else if (frame.kind === 'system' && frame.code === 'error') throw new Error('Tirociniumの音声処理に失敗しました。');
        }
      }
      if (!stopped && generation === activeGeneration) await stop('通話が切断されました。');
    } finally {
      // Transport may already have aborted; cancellation is best-effort cleanup.
      await reader.cancel().catch(() => undefined); reader.releaseLock();
    }
  };
  start.addEventListener('click', () => {
    if (running) return;
    running = true; stopped = false; seq = 0; generation++;
    mute.textContent = 'ミュート'; mute.setAttribute('aria-pressed', 'false');
    currentTurn = -1; ignoredTurn = -1;
    const activeGeneration = generation;
    controls(); status.textContent = 'マイクを準備しています…'; text.textContent = '';
    const capture = new CallAudio(); audio = capture;
    abort = new AbortController();
    void (async () => {
      try {
        await capture.start((pcm) => {
          if (activeGeneration === generation && audio === capture && !stopped) enqueue({ kind: 'audio_chunk', pcm });
        }, () => {
          if (activeGeneration === generation && audio === capture) void stop('マイクが停止したため通話を終了しました。');
        });
        if (stopped || activeGeneration !== generation) { await capture.stop(); return; }
        status.textContent = 'Tirociniumへ接続しています…';
        // Keep this request alive until the created id is received so cancellation
        // can DELETE it; the bridge also owns a no-stream timeout.
        const response = await ctx.api('/calls', { method: 'POST' });
        if (!response.ok) throw new Error('通話を開始できません。Tirociniumの接続設定や空き状況を確認してください。');
        const result = await response.json() as { call_id?: unknown };
        if (typeof result.call_id !== 'string') throw new Error('通話の応答が不正です。');
        if (stopped || activeGeneration !== generation) {
          await ctx.api(`/calls/${encodeURIComponent(result.call_id)}`, { method: 'DELETE' }); return;
        }
        callId = result.call_id; seq = 0; controls();
        const events = await ctx.api(`/calls/${encodeURIComponent(callId)}/events`, { signal: abort?.signal });
        if (!events.ok) throw new Error('通話の応答に接続できませんでした。');
        status.textContent = '通話中'; enqueue({ kind: 'start_interview' });
        await readEvents(events, activeGeneration);
      } catch (error) {
        if (!stopped && activeGeneration === generation) await stop(error instanceof Error ? error.message : '通話を開始できませんでした。');
      }
    })();
  });
  mute.addEventListener('click', () => {
    if (!audio) return;
    audio.muted = !audio.muted; mute.textContent = audio.muted ? 'ミュートを解除' : 'ミュート';
    mute.setAttribute('aria-pressed', String(audio.muted));
  });
  interrupt.addEventListener('click', () => {
    ignoredTurn = currentTurn; audio?.interrupt(); enqueue({ kind: 'barge_in' });
  });
  end.addEventListener('click', () => { void stop(); });
  const onExit = (): void => { void stop(); };
  window.addEventListener('pagehide', onExit);
  const observer = new MutationObserver(() => {
    if (card.wrap.isConnected) return;
    observer.disconnect(); window.removeEventListener('pagehide', onExit); void stop();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
