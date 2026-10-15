// 感想の追加ヒアリングと体験解析の応答 (Voluptas SPEC-GLAB-VOICE-FOLLOW-UP) を画面用に検証する純関数。
// 質問の文言と選択肢は Voluptas が正本で、GLab は受け取った形が正しいときだけ描く。

export const PLAY_PROGRESS_OPTIONS = [
  { value: 'early', label: '序盤' },
  { value: 'middle', label: '中盤' },
  { value: 'late', label: '終盤' },
  { value: 'cleared', label: 'クリア済み' },
  { value: 'post-clear', label: 'クリア後もやり込み中' },
] as const;

export type PlayProgress = typeof PLAY_PROGRESS_OPTIONS[number]['value'];

export interface FollowUpQuestion {
  id: string;
  prompt: string;
  answerType: 'choice' | 'text';
  options: { value: string; label: string }[];
}

export interface VoiceAnalysisView {
  state: 'complete' | 'stale' | 'not_analyzed';
  events: { label: string; valence: 'negative' | 'neutral' | 'positive' | null }[];
  observationCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shortText(value: unknown, maximum: number): string | null {
  return typeof value === 'string' && value.trim() && value.length <= maximum ? value : null;
}

export function isPlayProgress(value: unknown): value is PlayProgress {
  return PLAY_PROGRESS_OPTIONS.some((option) => option.value === value);
}

/** POST /reviews の 201 応答から記録 id を取り出す。 */
export function parseCreatedReviewId(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.data) || !isRecord(body.data.record)) return null;
  return shortText(body.data.record.id, 200);
}

/** `{ data: { question } }` の question。足りていれば (null) も正常として null を返す。形が違えば undefined。 */
export function parseFollowUpQuestion(body: unknown): FollowUpQuestion | null | undefined {
  if (!isRecord(body) || !isRecord(body.data) || !('question' in body.data)) return undefined;
  const question = body.data.question;
  if (question === null) return null;
  if (!isRecord(question)) return undefined;
  const id = shortText(question.id, 40);
  const prompt = shortText(question.prompt, 200);
  const answerType = question.answerType === 'choice' || question.answerType === 'text' ? question.answerType : null;
  if (!id || !prompt || !answerType) return undefined;
  const options = Array.isArray(question.options)
    ? question.options.flatMap((option) => {
      if (!isRecord(option)) return [];
      const value = shortText(option.value, 40);
      const label = shortText(option.label, 80);
      return value && label ? [{ value, label }] : [];
    })
    : [];
  if (answerType === 'choice' && options.length === 0) return undefined;
  return { id, prompt, answerType, options };
}

/** 体験解析の状態。表示に要る分 (出来事の見出しと感情の向き、観測の数) だけに絞る。 */
export function parseVoiceAnalysis(body: unknown): VoiceAnalysisView | null {
  if (!isRecord(body) || !isRecord(body.data)) return null;
  const state = body.data.state;
  if (state !== 'complete' && state !== 'stale' && state !== 'not_analyzed') return null;
  const analysis = isRecord(body.data.analysis) ? body.data.analysis : null;
  const events = Array.isArray(analysis?.events)
    ? analysis.events.flatMap((event) => {
      if (!isRecord(event)) return [];
      const label = shortText(event.label, 200);
      const valence: VoiceAnalysisView['events'][number]['valence'] =
        event.valence === 'negative' || event.valence === 'neutral' || event.valence === 'positive' ? event.valence : null;
      return label ? [{ label, valence }] : [];
    }).slice(0, 48)
    : [];
  const observationCount = Array.isArray(analysis?.observations) ? analysis.observations.length : 0;
  return { state, events, observationCount };
}
