import {
  el,
  ensureStyles,
  fmtDateTime,
  requireVantanUserRegistration,
  section,
  type PanelContext,
} from '../panel-kit.ts';

interface Link {
  id: string; url: string; title: string; summary: string | null; memo: string | null;
  postedByName: string | null; tags: string[]; createdAt: number;
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;
  let query = '';
  let tag = '';

  const render = async (): Promise<void> => {
    container.innerHTML = '';
    container.appendChild(el('h2', undefined, '🔗 技術リンク'));
    container.appendChild(createForm(ctx, render));

    const filter = section('共有リンク');
    const queryInput = input('タイトル・URL・説明を検索', query);
    const tagInput = input('タグで絞り込み', tag);
    const search = el('button', 'gl-btn ghost', '検索');
    search.onclick = () => { query = queryInput.value.trim(); tag = tagInput.value.trim(); void render(); };
    filter.body.append(el('div', 'gl-row'));
    filter.body.lastElementChild?.append(queryInput, tagInput, search);
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (tag) params.set('tag', tag);
    const response = await ctx.api(`/links?${params.toString()}`).catch(() => null);
    if (!response?.ok) {
      filter.body.appendChild(el('p', 'gl-notice gl-notice-error', 'リンクを取得できませんでした。'));
    } else {
      const links = (await response.json() as { links: Link[] }).links;
      if (!links.length) filter.body.appendChild(el('p', 'gl-muted', 'まだ共有リンクはありません。'));
      const list = el('div');
      for (const link of links) list.appendChild(linkCard(link, ctx));
      filter.body.appendChild(list);
    }
    container.appendChild(filter.wrap);
  };
  await render();
}

function createForm(ctx: PanelContext, rerender: () => Promise<void>): HTMLElement {
  const form = section('技術情報を共有');
  const url = input('URL (http / https)', '');
  const title = input('タイトル', '');
  const summary = textarea('要約 (任意)');
  const memo = textarea('メモ・解説 (任意)');
  const tags = input('タグ (カンマ区切り)', '');
  const submit = el('button', 'gl-btn', '共有する');
  const message = el('p', 'gl-muted');
  submit.onclick = async () => {
    submit.disabled = true;
    const result = await ctx.api('/links', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: url.value.trim(), title: title.value.trim(), summary: summary.value.trim() || undefined,
        memo: memo.value.trim() || undefined,
        tags: tags.value.split(',').map((value) => value.trim()).filter(Boolean),
      }),
    }).catch(() => null);
    if (result?.ok) await rerender();
    else { message.textContent = 'URL、タイトル、タグを確認してもう一度お試しください。'; submit.disabled = false; }
  };
  form.body.append(url, title, summary, memo, tags, submit, message);
  return form.wrap;
}

function linkCard(link: Link, ctx: PanelContext): HTMLElement {
  const card = el('article', 'gl-section');
  const anchor = el('a') as HTMLAnchorElement;
  anchor.href = link.url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; anchor.textContent = link.title;
  card.appendChild(anchor);
  if (link.summary) card.appendChild(el('p', undefined, link.summary));
  if (link.memo) card.appendChild(el('p', 'gl-muted', link.memo));
  const meta = el('div', 'gl-row');
  for (const tag of link.tags) meta.appendChild(el('span', 'gl-tag', tag));
  meta.appendChild(el('span', 'gl-muted', `${link.postedByName ?? '投稿者'} · ${fmtDateTime(link.createdAt)}`));
  const comment = el('button', 'gl-btn ghost', 'コメント');
  comment.onclick = () => void showComments(card, link.id, ctx);
  meta.appendChild(comment);
  card.appendChild(meta);
  return card;
}

/**
 * コメント欄はカード内で開閉・再読込する。 投稿後にパネル全体を再描画すると
 * 開いていたコメント欄と検索結果の位置が失われるため、 該当カードだけを更新する。
 */
async function showComments(card: HTMLElement, linkId: string, ctx: PanelContext): Promise<void> {
  const existing = card.querySelector('.tech-link-comments');
  if (existing) { existing.remove(); return; }
  const path = `/links/${encodeURIComponent(linkId)}/comments`;
  const host = el('div', 'tech-link-comments');
  const list = el('div');
  const message = el('p', 'gl-muted');
  const body = textarea('コメントを追加');
  const submit = el('button', 'gl-btn ghost', '送信');

  const reload = async (): Promise<void> => {
    list.innerHTML = '';
    const response = await ctx.api(path).catch(() => null);
    if (!response?.ok) {
      list.appendChild(el('p', 'gl-notice gl-notice-error', 'コメントを取得できませんでした。'));
      return;
    }
    const comments = (await response.json() as { comments: Array<{ body: string; displayName: string | null }> }).comments;
    if (!comments.length) list.appendChild(el('p', 'gl-muted', 'まだコメントはありません。'));
    for (const comment of comments) list.appendChild(el('p', 'gl-bubble', `${comment.displayName ?? '投稿者'}: ${comment.body}`));
  };

  submit.onclick = async () => {
    const value = body.value.trim();
    if (!value) { message.textContent = 'コメントを入力してください。'; return; }
    submit.disabled = true;
    const result = await ctx.api(path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: value }),
    }).catch(() => null);
    submit.disabled = false;
    if (!result?.ok) { message.textContent = 'コメントを送信できませんでした。'; return; }
    body.value = '';
    message.textContent = '';
    await reload();
  };

  host.append(list, body, submit, message);
  card.appendChild(host);
  await reload();
}

function input(placeholder: string, value: string): HTMLInputElement {
  const element = el('input', 'gl-input') as HTMLInputElement;
  element.placeholder = placeholder; element.value = value; return element;
}

function textarea(placeholder: string): HTMLTextAreaElement {
  const element = el('textarea', 'gl-textarea') as HTMLTextAreaElement;
  element.placeholder = placeholder; return element;
}
