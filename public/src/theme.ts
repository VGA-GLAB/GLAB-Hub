import { el } from './dom.ts';

type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'glab-theme';

/** @implements SPEC-GLAB-SHELL-007 */
function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    // Storage may be disabled; the OS preference remains usable.
    return 'system';
  }
}

/** @implements SPEC-GLAB-SHELL-007 */
export function initTheme(): void {
  document.documentElement.dataset.theme = readTheme();
}

/** @implements SPEC-GLAB-SHELL-007 */
export function themeControl(): HTMLElement {
  const label = el('label', 'theme-control');
  label.appendChild(el('span', 'sr-only', '配色'));
  const select = el('select');
  for (const [value, text] of [['system', '端末に合わせる'], ['light', 'ライト'], ['dark', 'ダーク']] as const) {
    const option = el('option', undefined, text);
    option.value = value;
    select.appendChild(option);
  }
  select.value = document.documentElement.dataset.theme ?? 'system';
  /** @implements SPEC-GLAB-SHELL-007 */
  select.onchange = () => {
    document.documentElement.dataset.theme = select.value;
    try {
      localStorage.setItem(THEME_KEY, select.value);
    } catch {
      // The selection still applies for this page when storage is unavailable.
    }
  };
  label.appendChild(select);
  return label;
}
