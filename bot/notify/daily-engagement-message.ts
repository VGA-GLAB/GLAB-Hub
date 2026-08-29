import type { DailyContent } from '../../plugins/daily-engagement/store.ts';
import { safePublicHttpUrl } from '../../plugins/daily-engagement/public-url.ts';

const DISCORD_MESSAGE_MAX = 2_000;
const DESCRIPTION_MAX = 500;

export function formatDailyEngagementMessage(
  daily: DailyContent,
  glabBaseUrl: string,
): string {
  const lines = ['🌟 **今日のスポットライト**'];
  if (daily.spotlight) {
    lines.push(`**${escapeMarkdown(daily.spotlight.name)}**`);
    if (daily.spotlight.description) {
      lines.push(escapeMarkdown(daily.spotlight.description.slice(0, DESCRIPTION_MAX)));
    }
    const repoUrl = safePublicHttpUrl(daily.spotlight.repoUrl);
    if (repoUrl) lines.push(`<${repoUrl}>`);
  } else {
    lines.push('進行中のプロジェクトを募集中です。今日は近くの制作仲間に注目してみよう。');
  }
  lines.push(
    '',
    `🎯 **5分クエスト：${escapeMarkdown(daily.quest.title)}**`,
    escapeMarkdown(daily.quest.prompt),
  );
  const hubUrl = safePublicHttpUrl(glabBaseUrl);
  if (hubUrl) lines.push('', `終わったら Hub で「できた！」 → <${hubUrl}>`);
  return lines.join('\n').slice(0, DISCORD_MESSAGE_MAX);
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}\[\]()#+\-.!|>~]/g, '\\$&');
}

