// GLab シェルが使う DOM 生成ヘルパ。

/** @implements SPEC-GLAB-SHELL-003 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * panel に渡す fetch — 401 でも throw せず、 呼び出し側が status を扱う。
 * @implements SPEC-GLAB-SHELL-003
 */
export async function apiFetchForPanel(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(path, { ...init, credentials: 'same-origin' });
}
