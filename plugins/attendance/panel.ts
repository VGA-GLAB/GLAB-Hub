// attendance パネル — Aedilis から自分の出席履歴 / (admin) 全員の出席を集約表示。

import {
  el,
  fmtDateTime,
  section,
  ensureStyles,
  connectorGuard,
  type PanelContext,
} from '../panel-kit.ts';

interface CheckinRow {
  id?: string;
  userId?: string;
  user_id?: string;
  displayName?: string;
  facilityId?: string;
  facility_id?: string;
  checkedInAt?: number;
  checked_in_at?: number;
  reservationId?: string | null;
}
interface Facility { id?: string; facilityId?: string; name?: string; displayName?: string }

function asArray<T>(body: unknown, key: string): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object') {
    const v = (body as Record<string, unknown>)[key];
    if (Array.isArray(v)) return v as T[];
  }
  return [];
}

export async function mount(container: HTMLElement, ctx: PanelContext): Promise<void> {
  ensureStyles();

  async function render(): Promise<void> {
    container.innerHTML = '';
    const head = el('div', 'gl-row');
    head.appendChild(el('h2', undefined, '✅ 集会出席'));
    const refresh = el('button', 'gl-btn ghost', '更新');
    refresh.onclick = () => void render();
    head.appendChild(refresh);
    container.appendChild(head);

    // 施設名ラベル解決 (id → name)
    const facLabel = new Map<string, string>();
    try {
      const fr = await ctx.api('/facilities');
      if (fr.ok) {
        for (const f of asArray<Facility>(await fr.json(), 'facilities')) {
          const id = f.id ?? f.facilityId;
          const name = f.displayName ?? f.name;
          if (id && name) facLabel.set(id, name);
        }
      }
    } catch {
      /* ラベル解決は best-effort */
    }

    function labelFacility(id: string | undefined): string {
      if (!id) return '?';
      return facLabel.get(id) ?? id;
    }

    function renderCheckins(rows: CheckinRow[], emptyMsg: string): HTMLElement {
      if (rows.length === 0) return el('p', 'gl-muted', emptyMsg);
      const ul = el('ul', 'gl-list');
      for (const row of rows) {
        const li = el('li');
        const ts = row.checkedInAt ?? row.checked_in_at;
        li.appendChild(el('strong', undefined, labelFacility(row.facilityId ?? row.facility_id)));
        if (row.displayName) li.appendChild(el('span', undefined, `  ${row.displayName}`));
        if (ts) li.appendChild(el('span', 'gl-muted', `  ${fmtDateTime(ts)}`));
        if (!row.reservationId) li.appendChild(el('span', 'gl-tag', ' walk-in'));
        ul.appendChild(li);
      }
      return ul;
    }

    // --- 自分の出席履歴 ---
    const mineRes = await ctx.api('/mine');
    const guard = await connectorGuard(mineRes, 'Aedilis (出席)');
    if (guard) {
      container.appendChild(guard);
      return;
    }
    const mineSec = section('自分の出席履歴');
    try {
      mineSec.body.appendChild(
        renderCheckins(asArray<CheckinRow>(await mineRes.json(), 'checkins'), '(出席記録はありません)'),
      );
    } catch {
      mineSec.body.appendChild(el('p', 'gl-muted', '出席データの解釈に失敗しました。'));
    }
    container.appendChild(mineSec.wrap);

    // --- 全員の出席 (admin のみ。 非 admin は Aedilis が 403 を返す) ---
    const allRes = await ctx.api('/list');
    if (allRes.ok) {
      const allSec = section('全員の出席 (管理者)');
      try {
        allSec.body.appendChild(
          renderCheckins(asArray<CheckinRow>(await allRes.json(), 'checkins'), '(出席記録はありません)'),
        );
      } catch {
        allSec.body.appendChild(el('p', 'gl-muted', '出席データの解釈に失敗しました。'));
      }
      container.appendChild(allSec.wrap);
    }

    container.appendChild(
      el(
        'p',
        'gl-muted',
        '出席は会場で passkey チェックイン (Ostiarius) すると記録されます。 ここは記録の閲覧面です。',
      ),
    );
  }

  await render();
}
