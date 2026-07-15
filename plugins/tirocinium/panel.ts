import {
  el,
  ensureStyles,
  requireVantanUserRegistration,
  section,
  type PanelContext,
} from '../panel-kit.ts';

interface Company {
  id: string;
  name: string;
  industry: string;
}

interface Relation {
  companyId: string;
  companyName: string;
  industry: string;
  type: 'desired' | 'offer';
  roleTitle: string;
  offeredOn: string | null;
}

function companiesFrom(value: unknown): Company[] {
  const rows = value && typeof value === 'object'
    ? (value as { companies?: unknown }).companies
    : null;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.name !== 'string') return [];
    return [{
      id: item.id,
      name: item.name,
      industry: typeof item.industry === 'string' ? item.industry : '',
    }];
  });
}

function relationsFrom(value: unknown): Relation[] {
  const rows = value && typeof value === 'object'
    ? (value as { relations?: unknown }).relations
    : null;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const type = item.relation_type;
    if (
      typeof item.company_id !== 'string'
      || typeof item.company_name !== 'string'
      || (type !== 'desired' && type !== 'offer')
    ) return [];
    return [{
      companyId: item.company_id,
      companyName: item.company_name,
      industry: typeof item.industry === 'string' ? item.industry : '',
      type,
      roleTitle: typeof item.role_title === 'string' ? item.role_title : '',
      offeredOn: typeof item.offered_on === 'string' ? item.offered_on : null,
    }];
  });
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  container.innerHTML = '';
  container.appendChild(el('h2', undefined, '🏢 企業'));
  container.appendChild(el(
    'p',
    'gl-muted',
    'Trの企業情報から志望企業と内定企業を登録できます。',
  ));

  const registered = section('登録済み');
  container.appendChild(registered.wrap);

  const search = section('企業を検索');
  const searchRow = el('div', 'gl-row');
  const query = el('input', 'gl-input');
  query.type = 'search';
  query.placeholder = '企業名・業界・職種';
  const searchButton = el('button', 'gl-btn', '検索');
  searchButton.type = 'button';
  searchRow.append(query, searchButton);
  const searchResults = el('div');
  search.body.append(searchRow, searchResults);
  container.appendChild(search.wrap);

  const reload = async (): Promise<void> => {
    registered.body.replaceChildren(el('p', 'gl-muted', '読み込み中…'));
    try {
      const response = await ctx.api('/career-companies');
      if (!response.ok) {
        registered.body.replaceChildren(unavailable(statusMessage(response.status, '取得')));
        return;
      }
      renderRelations(
        registered.body,
        relationsFrom(await response.json().catch(() => null)),
        ctx,
        reload,
      );
    } catch {
      registered.body.replaceChildren(unavailable('Trへ接続できませんでした。'));
    }
  };

  const runSearch = async (): Promise<void> => {
    const value = query.value.trim();
    if (!value) {
      searchResults.replaceChildren(el('p', 'gl-muted', '検索語を入力してください。'));
      return;
    }
    searchButton.disabled = true;
    searchResults.replaceChildren(el('p', 'gl-muted', '検索中…'));
    try {
      const response = await ctx.api(`/companies?q=${encodeURIComponent(value)}&limit=20`);
      if (!response.ok) {
        searchResults.replaceChildren(unavailable(statusMessage(response.status, '検索')));
        return;
      }
      renderSearchResults(
        searchResults,
        companiesFrom(await response.json().catch(() => null)),
        ctx,
        reload,
      );
    } catch {
      searchResults.replaceChildren(unavailable('Trへ接続できませんでした。'));
    } finally {
      searchButton.disabled = false;
    }
  };

  searchButton.addEventListener('click', () => void runSearch());
  query.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void runSearch();
  });
  await reload();
}

function renderRelations(
  target: HTMLElement,
  relations: Relation[],
  ctx: PanelContext,
  reload: () => Promise<void>,
): void {
  target.innerHTML = '';
  if (relations.length === 0) {
    target.appendChild(el('p', 'gl-muted', 'まだ企業は登録されていません。'));
    return;
  }
  for (const type of ['desired', 'offer'] as const) {
    const rows = relations.filter((row) => row.type === type);
    if (rows.length === 0) continue;
    target.appendChild(el('h4', undefined, type === 'desired' ? '志望企業' : '内定企業'));
    const list = el('ul', 'gl-list');
    for (const row of rows) {
      const item = el('li');
      const line = el('div', 'gl-row');
      line.appendChild(el('strong', undefined, row.companyName));
      if (row.industry) line.appendChild(el('span', 'gl-tag', row.industry));
      if (type === 'offer' && row.roleTitle) {
        line.appendChild(el('span', 'gl-muted', row.roleTitle));
      }
      if (type === 'offer' && row.offeredOn) {
        line.appendChild(el('span', 'gl-muted', `内定日 ${row.offeredOn}`));
      }
      const remove = el('button', 'gl-btn ghost', '解除');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        const response = await ctx.api(
          `/career-companies/${type}/${encodeURIComponent(row.companyId)}`,
          { method: 'DELETE' },
        );
        if (response.ok) await reload();
        else remove.disabled = false;
      });
      line.appendChild(remove);
      item.appendChild(line);
      list.appendChild(item);
    }
    target.appendChild(list);
  }
}

function renderSearchResults(
  target: HTMLElement,
  companies: Company[],
  ctx: PanelContext,
  reload: () => Promise<void>,
): void {
  target.innerHTML = '';
  if (companies.length === 0) {
    target.appendChild(el('p', 'gl-muted', '該当する企業がありません。'));
    return;
  }
  const list = el('ul', 'gl-list');
  for (const company of companies) {
    const item = el('li');
    const info = el('div', 'gl-row');
    info.appendChild(el('strong', undefined, company.name));
    if (company.industry) info.appendChild(el('span', 'gl-tag', company.industry));

    const desired = el('button', 'gl-btn', '志望企業に登録');
    desired.type = 'button';
    desired.addEventListener('click', async () => {
      desired.disabled = true;
      const response = await saveRelation(ctx, company.id, 'desired', {});
      if (response.ok) {
        desired.textContent = '登録済み';
        await reload();
      } else {
        desired.disabled = false;
      }
    });

    const offer = el('button', 'gl-btn ghost', '内定企業に登録');
    offer.type = 'button';
    offer.addEventListener('click', () => toggleOfferForm(item, company, ctx, reload));
    info.append(desired, offer);
    item.appendChild(info);
    list.appendChild(item);
  }
  target.appendChild(list);
}

function toggleOfferForm(
  item: HTMLLIElement,
  company: Company,
  ctx: PanelContext,
  reload: () => Promise<void>,
): void {
  const existing = item.querySelector('[data-offer-form]');
  if (existing) {
    existing.remove();
    return;
  }
  const form = el('div', 'gl-row');
  form.dataset.offerForm = '1';
  const role = el('input', 'gl-input');
  role.placeholder = '内定職種（任意）';
  role.maxLength = 200;
  const date = el('input', 'gl-input');
  date.type = 'date';
  const save = el('button', 'gl-btn', '内定情報を保存');
  save.type = 'button';
  save.addEventListener('click', async () => {
    save.disabled = true;
    const response = await saveRelation(ctx, company.id, 'offer', {
      roleTitle: role.value.trim(),
      offeredOn: date.value || null,
    });
    if (response.ok) {
      form.replaceChildren(el('span', 'gl-muted', '保存しました。'));
      await reload();
    } else {
      save.disabled = false;
      form.appendChild(el('span', 'gl-muted', `保存に失敗しました (${response.status})。`));
    }
  });
  form.append(role, date, save);
  item.appendChild(form);
}

function saveRelation(
  ctx: PanelContext,
  companyId: string,
  type: 'desired' | 'offer',
  body: { roleTitle?: string; offeredOn?: string | null },
): Promise<Response> {
  return ctx.api(`/career-companies/${type}/${encodeURIComponent(companyId)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function statusMessage(status: number, action: string): string {
  return status === 503
    ? `Trが稼働すると${action}できます。`
    : `${action}に失敗しました (${status})。`;
}

function unavailable(message: string): HTMLElement {
  const notice = el('div', 'gl-notice gl-notice-error');
  notice.appendChild(el('strong', undefined, 'Trに未接続'));
  notice.appendChild(el('p', 'gl-muted', message));
  return notice;
}
