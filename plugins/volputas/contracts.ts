export const SURVEY_CATEGORIES = [
  { id: 'game_review', label: 'ゲームレビュー' },
  { id: 'game_survey', label: 'ゲームアンケート' },
  { id: 'peer_question', label: 'ほかの人への質問' },
] as const;

export type SurveyCategory = (typeof SURVEY_CATEGORIES)[number]['id'];

export interface SurveyQuestion {
  id: string;
  text: string;
  type: 'scale' | 'choice' | 'freetext';
  required: boolean;
  options?: { min?: number; max?: number; choices?: string[] };
}

export interface SurveyView {
  id: string;
  title: string;
  description: string | null;
  category: SurveyCategory;
  questions: SurveyQuestion[];
  answered: boolean;
  createdAt: string;
}

export interface SurveyResponseView {
  surveyId: string;
  answers: Record<string, string | number>;
  submittedAt: string;
}

export interface ReviewView {
  id: string;
  gameTitle: string;
  recommend: boolean | null;
  comment: string;
  glabProjectId: string | null;
  createdAt: string;
  author: { name: string } | { pseudo: string };
}

export interface RecentGameView {
  name: string;
  playtimeTwoWeeksMinutes: number;
}

export function parseReviewList(value: unknown): ReviewView[] | null {
  if (!Array.isArray(value)) return null;
  const reviews = value.map(parseReview);
  return reviews.every((review): review is ReviewView => review !== null) ? reviews : null;
}

export function parseRecentGames(value: unknown): RecentGameView[] | null {
  if (!Array.isArray(value)) return null;
  const games = value.map(parseRecentGame);
  return games.every((game): game is RecentGameView => game !== null) ? games : null;
}

export function parseSurveyList(value: unknown): SurveyView[] | null {
  if (!isRecord(value) || value.ok !== true || !Array.isArray(value.data)) return null;
  const surveys = value.data.map(parseSurvey);
  return surveys.every((survey): survey is SurveyView => survey !== null) ? surveys : null;
}

export function parseSurveyDetail(value: unknown): {
  survey: SurveyView;
  response: SurveyResponseView | null;
} | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) return null;
  const survey = parseSurvey(value.data.survey);
  if (!survey) return null;
  if (value.data.response == null) return { survey, response: null };
  const response = parseResponse(value.data.response);
  return response ? { survey, response } : null;
}

function parseSurvey(value: unknown): SurveyView | null {
  if (!isRecord(value) || !isCategory(value.category) || !Array.isArray(value.questions)) return null;
  if (
    typeof value.id !== 'string'
    || typeof value.title !== 'string'
    || !(typeof value.description === 'string' || value.description === null)
    || typeof value.answered !== 'boolean'
    || typeof value.createdAt !== 'string'
  ) return null;
  const questions = value.questions.map(parseQuestion);
  if (!questions.every((question): question is SurveyQuestion => question !== null)) return null;
  return {
    id: value.id,
    title: value.title,
    description: value.description,
    category: value.category,
    questions,
    answered: value.answered,
    createdAt: value.createdAt,
  };
}

function parseReview(value: unknown): ReviewView | null {
  if (!isRecord(value) || !isRecord(value.author)) return null;
  if (
    typeof value.id !== 'string'
    || typeof value.gameTitle !== 'string'
    || !(typeof value.recommend === 'boolean' || value.recommend === null)
    || typeof value.comment !== 'string'
    || !(typeof value.glabProjectId === 'string' || value.glabProjectId === null)
    || typeof value.createdAt !== 'string'
  ) return null;
  const author = parseReviewAuthor(value.author);
  return author ? {
    id: value.id,
    gameTitle: value.gameTitle,
    recommend: value.recommend,
    comment: value.comment,
    glabProjectId: value.glabProjectId,
    createdAt: value.createdAt,
    author,
  } : null;
}

function parseReviewAuthor(value: Record<string, unknown>): ReviewView['author'] | null {
  if (typeof value.name === 'string') return { name: value.name };
  if (typeof value.pseudo === 'string') return { pseudo: value.pseudo };
  return null;
}

function parseRecentGame(value: unknown): RecentGameView | null {
  if (
    !isRecord(value)
    || typeof value.name !== 'string'
    || typeof value.playtimeTwoWeeksMinutes !== 'number'
  ) return null;
  return {
    name: value.name,
    playtimeTwoWeeksMinutes: value.playtimeTwoWeeksMinutes,
  };
}

function parseQuestion(value: unknown): SurveyQuestion | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'string'
    || typeof value.text !== 'string'
    || !['scale', 'choice', 'freetext'].includes(String(value.type))
  ) return null;
  const options = isRecord(value.options) ? {
    ...(typeof value.options.min === 'number' ? { min: value.options.min } : {}),
    ...(typeof value.options.max === 'number' ? { max: value.options.max } : {}),
    ...(Array.isArray(value.options.choices)
      && value.options.choices.every((choice) => typeof choice === 'string')
      ? { choices: value.options.choices as string[] }
      : {}),
  } : undefined;
  return {
    id: value.id,
    text: value.text,
    type: value.type as SurveyQuestion['type'],
    required: value.required === true,
    ...(options ? { options } : {}),
  };
}

function parseResponse(value: unknown): SurveyResponseView | null {
  if (!isRecord(value) || !isRecord(value.answers)) return null;
  if (typeof value.surveyId !== 'string' || typeof value.submittedAt !== 'string') return null;
  const entries = Object.entries(value.answers);
  if (!entries.every(([, answer]) => typeof answer === 'string' || typeof answer === 'number')) {
    return null;
  }
  return {
    surveyId: value.surveyId,
    answers: Object.fromEntries(entries) as Record<string, string | number>,
    submittedAt: value.submittedAt,
  };
}

function isCategory(value: unknown): value is SurveyCategory {
  return SURVEY_CATEGORIES.some((category) => category.id === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
