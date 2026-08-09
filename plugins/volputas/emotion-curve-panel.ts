import { el, fmtDateTime, type PanelContext } from '../panel-kit.ts';
import {
  parseEmotionCurveDetail,
  parseEmotionCurveList,
  parseMediaTicket,
  type EmotionCurveEntry,
  type EmotionCurveRecord,
  type GameView,
} from './contracts.ts';
import { gameSelector } from './games-panel.ts';

// Volputas の EMOTION_STAMPS と同じ 4 種。 増やすときは Volputas 側が正本で、
// 未知の stamp は保存時に 400 で弾かれる。
const STAMPS = [
  { id: 'hype', label: '盛り上がり' },
  { id: 'like', label: 'スキ' },
  { id: 'dislike', label: '嫌い' },
  { id: 'stress', label: 'ストレス' },
] as const;

/** 動画をアップして感情曲線を取るタブ。 */
export async function renderEmotionCurves(
  ctx: PanelContext,
  container: HTMLElement,
  games: GameView[] | null,
): Promise<void> {
  const workspace = el('div', 'gl-curve-workspace');
  const recorder = el('div', 'gl-curve-recorder');
  const history = el('div', 'gl-curve-history');
  workspace.append(recorder, history);
  container.appendChild(workspace);

  const reload = (): void => { void loadHistory(ctx, history); };
  renderRecorder(ctx, recorder, games, reload);
  reload();
}

function renderRecorder(
  ctx: PanelContext,
  container: HTMLElement,
  games: GameView[] | null,
  afterSave: () => void,
): void {
  container.appendChild(el('h3', undefined, '動画から感情曲線を取る'));
  container.appendChild(el(
    'p',
    'gl-muted',
    '動画を選び、再生しながら感じたところでスタンプを押します。保存すると評価まで実行します。',
  ));

  const selector = gameSelector(games);
  const filePicker = el('input', 'gl-input') as HTMLInputElement;
  filePicker.type = 'file';
  filePicker.accept = 'video/*';

  const video = el('video', 'gl-curve-video') as HTMLVideoElement;
  video.controls = true;
  video.preload = 'metadata';

  const stampRow = el('div', 'gl-curve-stamps');
  const entryList = el('div', 'gl-curve-entries');
  const message = el('p', 'gl-muted');
  const submit = el('button', 'gl-btn', '保存して評価');
  submit.type = 'button';
  submit.disabled = true;

  const entries: EmotionCurveEntry[] = [];
  let objectUrl: string | null = null;

  const redrawEntries = (): void => {
    entryList.replaceChildren(
      ...(entries.length === 0
        ? [el('p', 'gl-muted', 'まだスタンプがありません。')]
        : entries.map((entry, index) => entryRow(entry, () => {
          entries.splice(index, 1);
          redrawEntries();
        }))),
    );
    submit.disabled = entries.length === 0 || !filePicker.files?.[0];
  };

  filePicker.onchange = () => {
    const file = filePicker.files?.[0];
    // 前の動画の URL を解放しないと、 選び直すたびにメモリが積み上がる。
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = file ? URL.createObjectURL(file) : null;
    video.src = objectUrl ?? '';
    redrawEntries();
  };

  for (const stamp of STAMPS) {
    const button = el('button', 'gl-btn ghost', stamp.label);
    button.type = 'button';
    button.onclick = () => {
      entries.push({
        // 打刻は再生位置そのもの。 押した時刻ではないので、 一時停止して
        // 打ち直しても位置がずれない。
        timeSeconds: Math.max(0, Math.round(video.currentTime)),
        stamp: stamp.id,
        comment: '',
      });
      entries.sort((left, right) => (left.timeSeconds ?? 0) - (right.timeSeconds ?? 0));
      redrawEntries();
    };
    stampRow.appendChild(button);
  }

  submit.onclick = () => {
    const file = filePicker.files?.[0];
    const game = selector.read();
    if (!file || entries.length === 0) return;
    if (!game.gameTitle) {
      message.textContent = 'ゲームを選択してください。';
      return;
    }
    submit.disabled = true;
    void save(ctx, {
      game,
      file,
      entries,
      report: (text) => { message.textContent = text; },
    }).then((ok) => {
      submit.disabled = false;
      if (!ok) return;
      entries.length = 0;
      filePicker.value = '';
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = null;
      video.removeAttribute('src');
      selector.reset();
      redrawEntries();
      afterSave();
    });
  };

  container.append(selector.element, filePicker, video, stampRow, entryList, message, submit);
  redrawEntries();
}

function entryRow(entry: EmotionCurveEntry, remove: () => void): HTMLElement {
  const row = el('div', 'gl-row gl-curve-entry');
  const label = STAMPS.find((stamp) => stamp.id === entry.stamp)?.label ?? entry.stamp ?? '';
  row.append(
    el('span', 'gl-tag', formatSeconds(entry.timeSeconds ?? 0)),
    el('span', undefined, label),
  );
  const drop = el('button', 'gl-btn ghost', '削除');
  drop.type = 'button';
  drop.onclick = remove;
  row.appendChild(drop);
  return row;
}

/**
 * 記録作成 → 動画アップロード → 評価、 の 3 手。
 *
 * 記録が先に要るのは、 動画の置き場が記録 ID で決まるため。 途中で失敗しても
 * 記録は残るので、 どこまで進んだかを利用者に見せて次の手を選べるようにする。
 */
async function save(ctx: PanelContext, params: {
  game: { gameId: string | null; gameTitle: string };
  file: File;
  entries: EmotionCurveEntry[];
  report: (text: string) => void;
}): Promise<boolean> {
  params.report('記録を作成中…');
  const created = await ctx.api('/evidence/emotion-curves', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      gameTitle: params.game.gameTitle,
      gameId: params.game.gameId,
      mode: 'video',
      videoFileName: params.file.name,
      entries: params.entries,
    }),
  }).catch(() => null);
  if (!created?.ok) {
    params.report(`記録を作成できませんでした (${created?.status ?? '接続不可'})。`);
    return false;
  }
  const record = parseEmotionCurveDetail(await created.json().catch(() => null));
  if (!record) {
    params.report('Volputas から不正な応答を受け取りました。');
    return false;
  }

  params.report('動画をアップロード中…');
  const uploaded = await ctx.api(`/evidence/media/videos/${encodeURIComponent(record.id)}`, {
    method: 'PUT',
    headers: { 'content-type': params.file.type || 'application/octet-stream' },
    body: params.file,
  }).catch(() => null);
  if (!uploaded?.ok) {
    params.report('記録は保存しましたが、動画をアップロードできませんでした。');
    return false;
  }

  params.report('評価中… (LLM の応答を待っています)');
  const evaluated = await ctx.api(
    `/evidence/emotion-curves/${encodeURIComponent(record.id)}/evaluate`,
    { method: 'POST' },
  ).catch(() => null);
  if (!evaluated?.ok) {
    params.report('保存しました。評価は失敗したので、一覧から再実行してください。');
    return true;
  }
  params.report('保存して評価しました。');
  return true;
}

async function loadHistory(ctx: PanelContext, container: HTMLElement): Promise<void> {
  container.replaceChildren(el('h3', undefined, 'これまでの記録'));
  const response = await ctx.api('/evidence/emotion-curves').catch(() => null);
  if (!response?.ok) {
    container.appendChild(el('p', 'gl-muted', '記録を取得できませんでした。'));
    return;
  }
  const records = parseEmotionCurveList(await response.json().catch(() => null));
  if (!records) {
    container.appendChild(el('p', 'gl-muted', 'Volputas から不正な応答を受け取りました。'));
    return;
  }
  if (records.length === 0) {
    container.appendChild(el('p', 'gl-muted', 'まだ記録がありません。'));
    return;
  }
  for (const record of records) {
    container.appendChild(recordCard(ctx, record, () => void loadHistory(ctx, container)));
  }
}

function recordCard(
  ctx: PanelContext,
  record: EmotionCurveRecord,
  reload: () => void,
): HTMLElement {
  const card = el('article', 'gl-curve-card');
  const head = el('div', 'gl-row');
  head.append(
    el('strong', undefined, record.gameTitle),
    el('span', 'gl-tag', `${record.entries.length}点`),
  );
  const createdAt = Date.parse(record.createdAt);
  if (Number.isFinite(createdAt)) head.appendChild(el('small', 'gl-muted', fmtDateTime(createdAt)));
  card.appendChild(head);

  card.appendChild(curveStrip(record.entries));

  const play = el('button', 'gl-btn ghost', '動画を見る');
  play.type = 'button';
  const playerSlot = el('div');
  play.onclick = () => {
    play.disabled = true;
    void ctx.api(`/evidence/media/videos/${encodeURIComponent(record.id)}/ticket`)
      .then(async (response) => {
        const ticket = response.ok ? parseMediaTicket(await response.json().catch(() => null)) : null;
        if (!ticket) {
          playerSlot.replaceChildren(el('p', 'gl-muted', '動画を再生できませんでした。'));
          play.disabled = false;
          return;
        }
        const video = el('video', 'gl-curve-video') as HTMLVideoElement;
        video.controls = true;
        // チケットは Volputas 側のパス付きで返るので、 GLAB の中継口へ
        // 付け替えて使う。
        video.src = `/api/x/volputas/evidence/media/videos/${encodeURIComponent(record.id)}`
          + `?ticket=${encodeURIComponent(ticket)}`;
        playerSlot.replaceChildren(video);
      })
      .catch(() => {
        playerSlot.replaceChildren(el('p', 'gl-muted', '動画を再生できませんでした。'));
        play.disabled = false;
      });
  };

  const actions = el('div', 'gl-row');
  actions.appendChild(play);
  if (!record.evaluation) {
    const evaluate = el('button', 'gl-btn', '評価する');
    evaluate.type = 'button';
    evaluate.onclick = () => {
      evaluate.disabled = true;
      evaluate.textContent = '評価中…';
      void ctx.api(`/evidence/emotion-curves/${encodeURIComponent(record.id)}/evaluate`, {
        method: 'POST',
      }).then(reload).catch(() => {
        evaluate.disabled = false;
        evaluate.textContent = '評価する';
      });
    };
    actions.appendChild(evaluate);
  }
  card.append(actions, playerSlot);

  if (record.evaluation) {
    const evaluation = el('pre', 'gl-curve-evaluation');
    evaluation.textContent = JSON.stringify(record.evaluation, null, 2);
    card.appendChild(evaluation);
  }
  return card;
}

/** 時刻順のスタンプを帯で表す。 曲線そのものは Volputas 本体が描く。 */
function curveStrip(entries: EmotionCurveEntry[]): HTMLElement {
  const strip = el('div', 'gl-curve-strip');
  for (const entry of entries) {
    const dot = el('span', `gl-curve-dot ${entry.stamp ?? ''}`.trim());
    dot.title = `${formatSeconds(entry.timeSeconds ?? 0)} ${entry.stamp ?? ''}`;
    strip.appendChild(dot);
  }
  return strip;
}

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
