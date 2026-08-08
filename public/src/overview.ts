// GLab の「ステータス」タブ — コネクタの死活と参照サービスの公開データ。

import { apiFetch, apiJson } from '../../corpus/public/src/api.ts';
import type { HubOverview, ServiceInfo } from '../../corpus/public/src/types.ts';
import { el } from './dom.ts';

const HEALTH_LABEL: Record<string, string> = {
  up: '稼働',
  degraded: '一部',
  down: '停止',
};

/**
 * 1 サービスのカード — マニフェスト宣言済みデータを取得して表示する。
 * @implements SPEC-GLAB-SHELL-003
 */
function renderServiceCard(container: HTMLElement, svc: ServiceInfo): void {
  if (!svc.manifest) return;
  const card = el('div', 'service-card');
  const head = el('div', 'service-head');
  head.appendChild(el('strong', undefined, svc.manifest.displayName));
  head.appendChild(el('span', `badge badge-scope-${svc.scope}`, svc.scope));
  head.appendChild(el('span', 'muted', ` v${svc.manifest.version}`));
  card.appendChild(head);

  if (svc.manifest.data.length === 0) {
    card.appendChild(el('p', 'muted', '(集約データの宣言なし)'));
  }
  for (const d of svc.manifest.data) {
    const row = el('div', 'service-data-row');
    const btn = el('button', 'ghost', `${d.title} を取得`);
    const out = el('pre', 'service-data-out');
    out.style.display = 'none';
    /** @implements SPEC-GLAB-SHELL-003 */
    btn.onclick = async () => {
      btn.disabled = true;
      out.style.display = 'block';
      out.textContent = '取得中…';
      try {
        const res = await apiFetch(`/api/hub/data/${svc.id}/${d.id}`);
        const text = await res.text();
        out.textContent = res.ok ? text : `(${res.status}) ${text}`;
      } catch (e) {
        out.textContent = `取得に失敗: ${String(e)}`;
      } finally {
        btn.disabled = false;
      }
    };
    row.appendChild(btn);
    card.appendChild(row);
    card.appendChild(out);
  }
  container.appendChild(card);
}

/** @implements SPEC-GLAB-SHELL-003 */
function renderConnectorList(
  container: HTMLElement,
  label: string,
  list: HubOverview['local'],
): void {
  container.appendChild(el('h3', undefined, label));
  if (list.length === 0) {
    container.appendChild(el('p', 'muted', '(コネクタなし)'));
    return;
  }
  const ul = el('ul', 'connector-list');
  for (const conn of list) {
    const li = el('li');
    li.appendChild(
      el(
        'span',
        `badge badge-${conn.health.status}`,
        HEALTH_LABEL[conn.health.status] ?? conn.health.status,
      ),
    );
    li.appendChild(el('span', 'connector-title', conn.title));
    if (conn.health.detail) {
      li.appendChild(el('span', 'muted', ` — ${conn.health.detail}`));
    }
    ul.appendChild(li);
  }
  container.appendChild(ul);
}

/** @implements SPEC-GLAB-SHELL-003 */
export async function renderOverview(container: HTMLElement): Promise<void> {
  container.innerHTML = '';
  container.appendChild(el('p', 'muted', '読み込み中…'));
  try {
    const ov = await apiJson<HubOverview>('/api/hub/overview');
    const { services } = await apiJson<{ services: ServiceInfo[] }>(
      '/api/hub/services',
    );
    container.innerHTML = '';
    container.appendChild(
      el(
        'p',
        'muted',
        `稼働 ${ov.counts.up} / 一部 ${ov.counts.degraded} / 停止 ${ov.counts.down}`,
      ),
    );
    renderConnectorList(container, 'ローカル (この PC のサービス)', ov.local);
    renderConnectorList(container, 'マルチ (サーバ集約)', ov.multi);

    container.appendChild(el('h3', undefined, '参照サービスのデータ'));
    const withManifest = services.filter((s) => s.manifest);
    if (withManifest.length === 0) {
      container.appendChild(
        el('p', 'muted', '(マニフェストを公開しているサービスはありません)'),
      );
    }
    for (const svc of withManifest) renderServiceCard(container, svc);
  } catch (e) {
    container.innerHTML = '';
    container.appendChild(el('p', 'error', `集約に失敗: ${String(e)}`));
  }
}
