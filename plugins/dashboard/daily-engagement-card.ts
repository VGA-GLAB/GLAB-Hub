import { el, section, type PanelContext } from '../panel-kit.ts';
import { safePublicHttpUrl } from '../daily-engagement/public-url.ts';

export interface DailyEngagementView {
  dateKey: string;
  quest: {
    key: string;
    title: string;
    prompt: string;
    minutes: number;
  };
  spotlight: {
    id: string;
    name: string;
    description: string | null;
    repoUrl: string | null;
  } | null;
  completed: boolean;
}

export function renderDailyEngagement(
  daily: DailyEngagementView,
  ctx: PanelContext,
): HTMLElement {
  ensureDailyEngagementStyles();
  const { wrap, body } = section('きょうの5分');
  const card = el('div', 'gl-notice gl-daily-card');
  const quest = el('div', 'gl-daily-quest');
  quest.append(
    el('span', 'gl-tag active', '5分クエスト'),
    el('strong', 'gl-daily-title', daily.quest.title),
    el('p', undefined, daily.quest.prompt),
  );

  const action = el('div', 'gl-row');
  const complete = el('button', 'gl-btn', daily.completed ? '達成済み ✓' : 'できた！');
  const result = el('span', 'gl-muted');
  complete.setAttribute('type', 'button');
  if (daily.completed) complete.setAttribute('disabled', 'true');
  complete.onclick = async () => {
    complete.setAttribute('disabled', 'true');
    result.textContent = '記録中…';
    try {
      const response = await ctx.api('/daily-quest/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dateKey: daily.dateKey }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          result.textContent = '日付が変わりました。画面を再読み込みしてください。';
          return;
        }
        result.textContent = '記録できませんでした。もう一度お試しください。';
        complete.removeAttribute('disabled');
        return;
      }
      complete.textContent = '達成済み ✓';
      result.textContent = '今日の達成を記録しました。';
    } catch {
      result.textContent = '記録できませんでした。もう一度お試しください。';
      complete.removeAttribute('disabled');
    }
  };
  action.append(complete, result);
  quest.appendChild(action);
  card.appendChild(quest);

  const spotlight = el('aside', 'gl-daily-spotlight');
  spotlight.appendChild(el('span', 'gl-tag', '今日のスポットライト'));
  if (daily.spotlight) {
    spotlight.appendChild(el('strong', 'gl-daily-title', daily.spotlight.name));
    if (daily.spotlight.description) {
      spotlight.appendChild(el('p', undefined, daily.spotlight.description));
    }
    const repoUrl = safePublicHttpUrl(daily.spotlight.repoUrl);
    if (repoUrl) {
      const link = el('a', 'gl-btn ghost', 'プロジェクトを見る') as HTMLAnchorElement;
      link.href = repoUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      spotlight.appendChild(link);
    }
  } else {
    spotlight.appendChild(el('strong', 'gl-daily-title', '制作仲間にスポットライトを当てよう'));
    spotlight.appendChild(el('p', 'gl-muted', '進行中のプロジェクトが登録されると、ここで日替わり紹介します。'));
  }
  card.appendChild(spotlight);
  body.appendChild(card);
  return wrap;
}

let dailyEngagementStylesInjected = false;

function ensureDailyEngagementStyles(): void {
  if (dailyEngagementStylesInjected) return;
  dailyEngagementStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .gl-daily-card {
      display: grid; gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
      border-color: color-mix(in srgb, var(--gl-accent, #6c5ce7) 45%, transparent);
      background: linear-gradient(135deg, color-mix(in srgb, var(--gl-accent, #6c5ce7) 10%, transparent), transparent);
    }
    .gl-daily-quest, .gl-daily-spotlight { display: grid; align-content: start; gap: 0.55rem; }
    .gl-daily-spotlight { border-left: 1px solid var(--gl-border, #444); padding-left: 1rem; }
    .gl-daily-title { display: block; font-size: 1.1rem; }
    @media (max-width: 40rem) {
      .gl-daily-spotlight { border-left: 0; border-top: 1px solid var(--gl-border, #444); padding: 1rem 0 0; }
    }
  `;
  document.head.appendChild(style);
}
