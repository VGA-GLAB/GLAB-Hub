import type { PanelContext } from '../panel-kit.ts';

export interface Equipment { qr_code: string; name: string; spec: string | null }
export interface Loan {
  id: number; source: 'book' | 'equipment'; external_key: string; label: string | null;
  borrowed_at: string; due_at: string | null; returned_at: string | null;
}
export interface Lookup {
  source: 'book' | 'equipment';
  meta: { isbn?: string; qrCode?: string; title?: string; name?: string; author?: string | null; spec?: string | null };
}

/** Stable user-facing errors; upstream diagnostics are never rendered verbatim. */
export async function request<T>(ctx: PanelContext, path: string, init?: RequestInit): Promise<T> {
  const response = await ctx.api(path, init);
  if (!response.ok) {
    if (response.status === 401) throw new Error('ログインし直してください。');
    if (response.status === 403) throw new Error('この操作を行う権限がありません。');
    if (response.status === 409) throw new Error('この本・機材はすでに貸出中です。');
    if (response.status === 404) throw new Error('本・機材が見つかりません。番号を確認してください。');
    if (response.status >= 500) throw new Error('貸出サービスに接続できません。しばらくして再読み込みしてください。');
    throw new Error('入力内容を確認してください。');
  }
  return response.json() as Promise<T>;
}
