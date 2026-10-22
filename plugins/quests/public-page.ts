import type { listPublicQuests } from './store.ts';
import { POSTER_STYLE } from './poster-style.ts';
import { discordContactMarkup } from './discord-contact.ts';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[character] ?? character);
}
const categories = { team:'TEAM MEMBERS', urgent:'URGENT REQUEST', personal:'PERSONAL PROJECT' };
export function renderQuestBoard(quests: ReturnType<typeof listPublicQuests>, embedded=false): string {
  const posters=quests.map(quest => `<article class="poster" id="quest-${escapeHtml(quest.id)}">
    <p class="wanted" lang="en">WANTED</p><p class="category" lang="en">${categories[quest.category]}</p>
    <h2>${escapeHtml(quest.title)}</h2><h3>内容</h3><div class="description">${escapeHtml(quest.description)}</div>
    <h3>期間・締切</h3><div class="description">${escapeHtml(quest.period || '記載なし')}</div>
    <h3>条件</h3><div class="description">${escapeHtml(quest.conditions || '記載なし')}</div>
    <div class="contact-block"><div class="contact-label">応募・相談は依頼者へ直接</div><div class="contact">${escapeHtml(quest.contact)}</div></div>
    ${quest.contact_type==='discord'?discordContactMarkup(quest.contact):''}
    <div class="seal">${quest.approved_role==='instructor'?'講師承認':'運営承認'}<small>${new Date(quest.approved_at ?? 0).toISOString().slice(0,10)}</small></div>
    <p class="note">この印は掲示の許可です。依頼内容や成果の保証ではありません。</p></article>`).join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>クエストボード | GLab</title><style>${POSTER_STYLE}${embedded?'header,footer{display:none}main{padding:16px}':''}</style></head><body>
    <header><div class="topline"><span class="eyebrow">GLAB / COMMUNITY QUESTS</span><a href="/">GLabへ・掲示を依頼する</a></div><h1>クエストボード</h1>
    <p class="intro">仲間を探す。ひとつの技を借りる。<br>あなたの力を待っている、制作のクエスト。</p></header>
    <main><div class="board">${posters || '<p class="empty">現在、公開中のクエストはありません。</p>'}</div></main>
    <footer class="footer">閲覧・応募にGLab登録は不要です。記載の連絡先へ直接ご連絡ください。<br>張り出しはGLab登録メンバーのみ。運営・講師の承認後に公開されます。<br>応募後のやり取りには運営・講師は介入しません。</footer></body></html>`;
}
