import { apiJson } from '../../corpus/public/src/api.ts';
import { el } from './dom.ts';

const MEMBERSHIP_LABELS: Record<string, string> = {
  active: '在校生', alumni: 'OB', invited: '招待中', suspended: '休止中',
};
const LOCATION_LABELS = { unset: '未設定', school: '学校', home: '自宅', away: '外出先' };
type Location = keyof typeof LOCATION_LABELS;
const REFRESH_MS = 30_000;

/** @implements SPEC-GLAB-SHELL-009 */
function statusItem(label: string): { box: HTMLElement; value: HTMLElement } {
  const box = el('div', 'status-item');
  box.appendChild(el('span', 'status-label', label));
  const value = el('span', undefined, '確認中…');
  box.appendChild(value);
  return { box, value };
}

/** Refresh only while mounted; each source can fail independently.
 * @implements SPEC-GLAB-SHELL-009
 */
export function mountHeaderStatus(container: HTMLElement): () => void {
  const controller = new AbortController();
  const membership = statusItem('所属');
  const available = statusItem('おれひま');
  const place = statusItem('現在地');
  const locationSelect = el('select');
  locationSelect.setAttribute('aria-label', '現在地（本人申告）');
  for (const [value, label] of Object.entries(LOCATION_LABELS)) {
    const option = el('option', undefined, label);
    option.value = value;
    locationSelect.appendChild(option);
  }
  locationSelect.disabled = true;
  locationSelect.hidden = true;
  place.box.appendChild(locationSelect);
  const refresh = el('button', 'status-refresh', '更新');
  refresh.setAttribute('aria-label', '自分の状態を更新');
  const feedback = el('span', 'status-error');
  feedback.setAttribute('role', 'status');
  container.append(membership.box, available.box, place.box, refresh, feedback);
  let pending = false;
  let saving = false;
  let savedLocation: Location = 'unset';
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** @implements SPEC-GLAB-SHELL-009 */
  async function update(): Promise<void> {
    if (pending || saving || controller.signal.aborted || document.hidden) return;
    pending = true;
    refresh.disabled = true;
    locationSelect.disabled = true;
    const init = { signal: controller.signal, cache: 'no-store' as const };
    await Promise.allSettled([
      apiJson<{ status: string | null }>('/api/x/dashboard/membership', init).then((data) => {
        membership.value.textContent = data.status ? MEMBERSHIP_LABELS[data.status] ?? '未登録' : '未登録';
      }).catch(() => { membership.value.textContent = '取得できません'; }),
      apiJson<{ availableNow: boolean }>('/api/x/consult/availability', init).then((data) => {
        if (typeof data.availableNow !== 'boolean') throw new Error('Invalid availability');
        available.value.textContent = data.availableNow ? '受付中' : 'オフ';
        available.box.dataset.active = String(data.availableNow);
      }).catch(() => {
        available.value.textContent = '取得できません';
        delete available.box.dataset.active;
      }),
      apiJson<{ location: Location }>('/api/x/dashboard/location', init).then((data) => {
        if (!Object.prototype.hasOwnProperty.call(LOCATION_LABELS, data.location)) throw new Error('Invalid location');
        savedLocation = data.location;
        locationSelect.value = data.location;
        locationSelect.hidden = false;
        place.value.hidden = true;
      }).catch(() => {
        place.value.hidden = false;
        place.value.textContent = '取得できません';
        locationSelect.hidden = true;
      }),
    ]);
    pending = false;
    refresh.disabled = false;
    locationSelect.disabled = locationSelect.hidden;
  }
  /** @implements SPEC-GLAB-SHELL-009 */
  async function schedule(): Promise<void> {
    await update();
    if (!controller.signal.aborted) timer = setTimeout(() => { void schedule(); }, REFRESH_MS);
  }
  /** @implements SPEC-GLAB-SHELL-009 */
  locationSelect.onchange = async () => {
    if (pending || saving) return;
    saving = true;
    locationSelect.disabled = true;
    feedback.textContent = '';
    const next = locationSelect.value as Location;
    try {
      await apiJson('/api/x/dashboard/location', {
        method: 'PUT', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: next }),
      });
      savedLocation = next;
    } catch {
      locationSelect.value = savedLocation;
      feedback.textContent = '現在地を保存できませんでした';
    } finally {
      saving = false;
      locationSelect.disabled = false;
    }
  };
  refresh.onclick = () => { void update(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void update(); }, { signal: controller.signal });
  window.addEventListener('focus', () => { void update(); }, { signal: controller.signal });
  void schedule();
  return () => { controller.abort(); clearTimeout(timer); };
}
