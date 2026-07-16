// facility パネル — Aedilis から施設一覧 / 予約を集約表示 + 新規予約フォーム。

import {
  el,
  fmtDateTime,
  section,
  ensureStyles,
  connectorGuard,
  requireVantanUserRegistration,
  type PanelContext,
} from '../panel-kit.ts';

interface Facility { id?: string; facilityId?: string; displayName?: string; name?: string }
interface Reservation {
  id?: string;
  facilityId?: string;
  facility_id?: string;
  startAt?: number;
  start_at?: number;
  endAt?: number;
  end_at?: number;
  purpose?: string;
  state?: string;
}

function asArray<T>(body: unknown, ...keys: string[]): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    for (const key of keys) {
      const value = (body as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();
  if (!await requireVantanUserRegistration(container, ctx)) return;

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '🏫 施設予約'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    // --- 施設一覧 + 新規予約フォーム ---
    const facRes = await ctx.api('/facilities');
    const guard = await connectorGuard(facRes, 'Aedilis (施設予約)');
    if (guard) {
      container.appendChild(guard);
      return;
    }
    let facilities: Facility[] = [];
    const facSec = section('施設一覧');
    try {
      facilities = asArray<Facility>(await facRes.json(), 'items', 'facilities');
      if (facilities.length === 0) {
        facSec.body.appendChild(el('p', 'gl-muted', '(施設がありません)'));
      } else {
        const ul = el('ul', 'gl-list');
        for (const f of facilities) {
          const li = el('li');
          li.appendChild(
            el('strong', undefined, f.displayName ?? f.name ?? f.id ?? f.facilityId ?? '?'),
          );
          ul.appendChild(li);
        }
        facSec.body.appendChild(ul);
      }
    } catch {
      facSec.body.appendChild(el('p', 'gl-muted', '施設データの解釈に失敗しました。'));
    }
    container.appendChild(facSec.wrap);

    // --- 新規予約 ---
    if (facilities.length > 0) {
      const formSec = section('新規予約');
      const sel = el('select', 'gl-select') as HTMLSelectElement;
      for (const f of facilities) {
        const opt = el('option') as HTMLOptionElement;
        opt.value = f.id ?? f.facilityId ?? '';
        opt.textContent = f.displayName ?? f.name ?? opt.value;
        sel.appendChild(opt);
      }
      const start = el('input', 'gl-input') as HTMLInputElement;
      start.type = 'datetime-local';
      const end = el('input', 'gl-input') as HTMLInputElement;
      end.type = 'datetime-local';
      const purpose = el('input', 'gl-input') as HTMLInputElement;
      purpose.placeholder = '目的 (任意)';
      const submit = el('button', 'gl-btn', '予約する');
      const msg = el('p', 'gl-muted');

      submit.onclick = async () => {
        if (!start.value || !end.value) {
          msg.textContent = '開始 / 終了を入力してください。';
          return;
        }
        submit.setAttribute('disabled', 'true');
        msg.textContent = '送信中…';
        try {
          const res = await ctx.api('/reservations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              facilityId: sel.value,
              startAt: new Date(start.value).toISOString(),
              endAt: new Date(end.value).toISOString(),
              purpose: purpose.value || undefined,
            }),
          });
          if (res.ok) {
            msg.textContent = '予約しました。';
            await render();
            return;
          }
          if (res.status === 409) {
            msg.textContent = 'その時間帯は既に予約があります (重複)。';
          } else {
            msg.textContent = `予約に失敗しました (${res.status})。`;
          }
        } catch {
          msg.textContent = '予約に失敗しました。';
        } finally {
          submit.removeAttribute('disabled');
        }
      };

      const row = el('div', 'gl-row');
      row.append(sel, start, end, purpose, submit);
      formSec.body.append(row, msg);
      container.appendChild(formSec.wrap);
    }

    // --- 自分の予約 ---
    const resSec = section('自分の予約');
    const resRes = await ctx.api('/reservations/mine');
    if (resRes.ok) {
      try {
        const list = asArray<Reservation>(await resRes.json(), 'items', 'reservations');
        if (list.length === 0) {
          resSec.body.appendChild(el('p', 'gl-muted', '(予約はありません)'));
        } else {
          const ul = el('ul', 'gl-list');
          for (const r of list) {
            const li = el('li');
            li.appendChild(el('strong', undefined, r.facilityId ?? r.facility_id ?? '?'));
            const st = r.startAt ?? r.start_at;
            if (st) li.appendChild(el('span', 'gl-muted', `  ${fmtDateTime(st)}`));
            if (r.purpose) li.appendChild(el('span', undefined, ` — ${r.purpose}`));
            const cancel = el('button', 'gl-btn ghost', 'キャンセル');
            cancel.onclick = async () => {
              if (!r.id) return;
              const del = await ctx.api(`/reservations/${r.id}`, { method: 'DELETE' });
              if (del.ok) await render();
            };
            li.appendChild(cancel);
            ul.appendChild(li);
          }
          resSec.body.appendChild(ul);
        }
      } catch {
        resSec.body.appendChild(el('p', 'gl-muted', '予約データの解釈に失敗しました。'));
      }
    } else {
      resSec.body.appendChild(el('p', 'gl-muted', '予約一覧を取得できませんでした。'));
    }
    container.appendChild(resSec.wrap);
  }

  await render();
}
