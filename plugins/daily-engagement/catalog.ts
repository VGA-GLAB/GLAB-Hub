/** 日次コンテンツの基準時刻。全員が同じ日付と通知時刻を見るため固定する。 */
export const DAILY_TIME_ZONE = 'Asia/Tokyo';

export const DAILY_QUESTS = [
  {
    key: 'play-and-praise',
    title: '触って、好きなところを伝える',
    spotlightPrompt: '今日のスポットライトを3分触って、好きなところを1つ制作者へ伝えよう。',
    fallbackPrompt: '近くの制作物を3分触って、好きなところを1つ制作者へ伝えよう。',
  },
  {
    key: 'find-friction',
    title: '迷いどころを1つ共有する',
    spotlightPrompt: '今日のスポットライトを触って、迷いそうなところを1つやさしく共有しよう。',
    fallbackPrompt: '制作仲間の画面を見て、迷いそうなところを1つやさしく共有しよう。',
  },
  {
    key: 'ask-one-question',
    title: '気になることを1つ質問する',
    spotlightPrompt: '今日のスポットライトの紹介を見て、気になることを1つ質問しよう。',
    fallbackPrompt: '制作仲間に、いま一番工夫していることを1つ質問しよう。',
  },
  {
    key: 'recommend-one-line',
    title: 'おすすめの一文をつくる',
    spotlightPrompt: '今日のスポットライトを誰かに勧める一文を考えて、制作者へ伝えよう。',
    fallbackPrompt: '最近触った作品を誰かに勧める一文をつくって共有しよう。',
  },
  {
    key: 'small-idea',
    title: '小さなアイデアを1つ渡す',
    spotlightPrompt: '今日のスポットライトで次に試せそうな小さなアイデアを1つ伝えよう。',
    fallbackPrompt: '制作仲間に、5分で試せそうな小さなアイデアを1つ伝えよう。',
  },
] as const;

export type DailyQuestKey = (typeof DAILY_QUESTS)[number]['key'];

export interface DailyQuest {
  key: DailyQuestKey;
  title: string;
  prompt: string;
  minutes: 5;
}

type DailyQuestDefinition = (typeof DAILY_QUESTS)[number];

const QUEST_BY_KEY = new Map<DailyQuestKey, DailyQuestDefinition>(
  DAILY_QUESTS.map((quest) => [quest.key, quest] as const),
);

export function tokyoDateKey(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: 'year' | 'month' | 'day'): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const dateKey = `${value('year')}-${value('month')}-${value('day')}`;
  assertDateKey(dateKey);
  return dateKey;
}

export function questKeyForDate(dateKey: string): DailyQuestKey {
  assertDateKey(dateKey);
  const dayNumber = Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000);
  const index = ((dayNumber % DAILY_QUESTS.length) + DAILY_QUESTS.length) % DAILY_QUESTS.length;
  const selected = DAILY_QUESTS[index];
  if (!selected) throw new Error(`daily quest index out of range: ${index}`);
  return selected.key;
}

export function dailyQuest(key: string, hasSpotlight: boolean): DailyQuest {
  const found = QUEST_BY_KEY.get(key as DailyQuestKey);
  if (!found) throw new Error(`unknown daily quest: ${key}`);
  return {
    key: found.key,
    title: found.title,
    prompt: hasSpotlight ? found.spotlightPrompt : found.fallbackPrompt,
    minutes: 5,
  };
}

export function assertDateKey(dateKey: string): void {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  const roundTrip = Number.isNaN(parsed) ? '' : new Date(parsed).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || roundTrip !== dateKey) {
    throw new Error(`invalid date key: ${dateKey}`);
  }
}

export function normalizeDailyNotifyAt(value: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('GLAB_DAILY_NOTIFY_AT must be HH:MM');
  const hour = Number(match[1] ?? Number.NaN);
  const minute = Number(match[2] ?? Number.NaN);
  if (hour > 23 || minute > 59) throw new Error('GLAB_DAILY_NOTIFY_AT must be a valid time');
  return value;
}

export function isDailyNotificationDue(now: Date, notifyAt: string): boolean {
  const normalized = normalizeDailyNotifyAt(notifyAt);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DAILY_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error('could not resolve current time in Asia/Tokyo');
  }
  const currentMinutes = hour * 60 + minute;
  const notifyHour = Number(normalized.slice(0, 2));
  const notifyMinute = Number(normalized.slice(3, 5));
  return currentMinutes >= notifyHour * 60 + notifyMinute;
}
