import { el } from './dom.ts';

/** Owns the mobile drawer's keyboard and responsive lifecycle.
 * @implements SPEC-GLAB-SHELL-008
 */
export function setupNavigation(
  layout: HTMLElement,
  nav: HTMLElement,
  main: HTMLElement,
  toggle: HTMLButtonElement,
): { close: () => void; dispose: () => void } {
  const controller = new AbortController();
  const mobile = matchMedia('(max-width: 700px)');
  const backdrop = el('button', 'nav-backdrop');
  backdrop.setAttribute('aria-label', 'メニューを閉じる');
  backdrop.tabIndex = -1;
  backdrop.hidden = true;
  layout.appendChild(backdrop);
  const closeButton = el('button', 'nav-close', '閉じる');
  nav.prepend(closeButton);
  nav.id = 'main-navigation';
  nav.setAttribute('aria-label', 'メインメニュー');
  toggle.setAttribute('aria-controls', nav.id);
  toggle.setAttribute('aria-expanded', 'false');
  let open = false;
  /** @implements SPEC-GLAB-SHELL-008 */
  function setOpen(next: boolean): void {
    open = next && mobile.matches;
    layout.dataset.menuOpen = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    backdrop.hidden = !open;
    main.inert = open;
    if (open) closeButton.focus();
  }
  /** @implements SPEC-GLAB-SHELL-008 */
  function close(): void {
    const restoreFocus = open;
    setOpen(false);
    if (restoreFocus) toggle.focus();
  }
  /** @implements SPEC-GLAB-SHELL-008 */
  toggle.onclick = () => open ? close() : setOpen(true);
  closeButton.onclick = close;
  backdrop.onclick = close;
  /** @implements SPEC-GLAB-SHELL-008 */
  layout.addEventListener('keydown', (event) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab') return;
    const items = [...nav.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }, { signal: controller.signal });
  /** @implements SPEC-GLAB-SHELL-008 */
  mobile.addEventListener('change', () => {
    const focusInNav = nav.contains(document.activeElement);
    setOpen(false);
    if (mobile.matches && focusInNav) toggle.focus();
  }, { signal: controller.signal });
  return { close, dispose: () => { controller.abort(); main.inert = false; } };
}
