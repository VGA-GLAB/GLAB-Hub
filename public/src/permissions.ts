import { apiJson } from '../../corpus/public/src/api.ts';
import { el } from './dom.ts';

export interface SelfPermissions {
  permissions: Array<{ key: string; allowed: boolean; purpose: string | null }>;
  isAdmin: boolean;
  canEditPresence: boolean;
}

/** @implements SPEC-GLAB-PERMISSIONS-001 */
export async function permissionSettingsLink(label = 'Cr：権限設定'): Promise<HTMLAnchorElement> {
  const data = await apiJson<{ url: string }>('/api/x/dashboard/permission-settings');
  const url = new URL(data.url);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid settings URL');
  const link = el('a', 'ghost', label);
  link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}

/** @implements SPEC-GLAB-PERMISSIONS-001 */
export async function renderSelfPermissions(container: HTMLElement): Promise<void> {
  container.append(el('h3', undefined, '自分の権限'));
  try { container.append(await permissionSettingsLink()); }
  catch { container.append(el('p', 'muted', 'Cr の設定先を取得できませんでした。')); }
  try {
    const data = await apiJson<SelfPermissions>('/api/x/dashboard/permissions');
    container.append(el('p', undefined, `GLab：${data.isAdmin ? '管理者' : '一般利用者'}`));
    const list = el('ul');
    for (const p of data.permissions) {
      const title = p.key === 'user_data.module:presence' ? 'おれひま・現在地' : (p.purpose ?? p.key);
      list.append(el('li', undefined, `${title}：${p.allowed ? '許可あり' : '許可なし'}`));
    }
    container.append(list);
  } catch { container.append(el('p', 'muted', '自分の権限は未確認です。Cr の設定を確認してください。')); }
}
