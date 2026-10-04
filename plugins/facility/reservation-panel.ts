import { el, section, fmtDateTime, type PanelContext } from '../panel-kit.ts';
import { audienceFields, audienceLabel, field, localDateTime, requireOk, type Audience, type Facility, type Group } from './audience-fields.ts';

interface Reservation extends Audience {
  id: string; facility_id: string; facility_name?: string; owner_user_id: string;
  start_at: number; end_at: number; purpose: string; state: string;
  meeting_id?: string | null;
}

export async function renderReservations(container: HTMLElement, ctx: PanelContext, facilities: Facility[], groups: Group[]): Promise<void> {
  const formSection = section('施設予約');
  const form = el('form', 'gl-col') as HTMLFormElement;
  const facility = el('select', 'gl-select') as HTMLSelectElement;
  facilities.forEach(item => facility.append(new Option(item.name, item.id)));
  facility.required = true;
  const start = el('input', 'gl-input') as HTMLInputElement; start.type = 'datetime-local'; start.required = true;
  const end = el('input', 'gl-input') as HTMLInputElement; end.type = 'datetime-local'; end.required = true;
  const purpose = el('input', 'gl-input') as HTMLInputElement; purpose.maxLength = 3000;
  const audience = audienceFields(groups);
  const save = el('button', 'gl-btn', '予約する') as HTMLButtonElement; save.type = 'submit';
  const reset = el('button', 'gl-btn ghost', '新しい予約') as HTMLButtonElement; reset.type = 'button';
  const status = el('p', 'gl-muted'); status.setAttribute('role', 'status');
  const listSection = section('閲覧できる施設予約');
  let editing: string | null = null;
  const clear = (): void => { editing = null; facility.disabled = false; form.reset(); audience.write({ visibility: 'private', group: null }); save.textContent = '予約する'; };
  reset.onclick = () => { clear(); status.textContent = ''; };
  form.append(field('施設', facility), field('開始', start), field('終了', end), field('目的', purpose), audience.element, save, reset, status);
  formSection.body.append(form); container.append(formSection.wrap, listSection.wrap);

  async function load(): Promise<void> {
    const response = await ctx.api('/reservations'); await requireOk(response);
    const { items } = await response.json() as { items: Reservation[] };
    listSection.body.replaceChildren();
    if (!items.length) listSection.body.append(el('p', 'gl-muted', '予約はありません。'));
    for (const item of items) {
      const row = el('div', 'gl-col');
      row.append(el('strong', undefined, item.facility_name ?? item.facility_id),
        el('span', undefined, `${fmtDateTime(item.start_at)} 〜 ${fmtDateTime(item.end_at)}`),
        el('span', undefined, item.purpose), el('span', 'gl-muted', `${audienceLabel(item)}${item.state === 'cancelled' ? ' · キャンセル済み' : ''}`));
      const fill = (copy: boolean): void => {
        editing = copy ? null : item.id; facility.disabled = !copy;
        facility.value = item.facility_id; start.value = localDateTime(item.start_at); end.value = localDateTime(item.end_at);
        purpose.value = item.purpose; audience.write(item);
        save.textContent = copy ? 'コピーを予約する' : '変更を保存';
        status.textContent = copy ? '日時を変更して、新しい予約として保存してください。' : '';
        form.scrollIntoView({ block: 'start', behavior: 'smooth' }); start.focus();
      };
      const copy = el('button', 'gl-btn ghost', 'コピー'); copy.onclick = () => fill(true); row.append(copy);
      if (item.meeting_id) row.append(el('span', 'gl-muted', '会議の予定から変更できます。'));
      if (item.owner_user_id === ctx.identity.userId && item.state !== 'cancelled' && !item.meeting_id) {
        const edit = el('button', 'gl-btn ghost', '編集'); edit.onclick = () => fill(false);
        const cancel = el('button', 'gl-btn ghost', 'キャンセル') as HTMLButtonElement;
        cancel.onclick = async () => {
          cancel.disabled = true;
          try { await requireOk(await ctx.api(`/reservations/${encodeURIComponent(item.id)}`, { method: 'DELETE' })); await load(); }
          catch (error) { status.textContent = error instanceof Error ? error.message : 'キャンセルできませんでした。'; }
          finally { cancel.disabled = false; }
        };
        row.append(edit, cancel);
      }
      listSection.body.append(row);
    }
  }
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = true;
    try {
      if (new Date(start.value) >= new Date(end.value)) throw new Error('終了は開始より後にしてください。');
      const body = { ...audience.read(), ...(!editing ? { facilityId: facility.value } : {}),
        startAt: new Date(start.value).toISOString(), endAt: new Date(end.value).toISOString(), purpose: purpose.value };
      await requireOk(await ctx.api(editing ? `/reservations/${encodeURIComponent(editing)}` : '/reservations', {
        method: editing ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }));
      clear(); status.textContent = '保存しました。'; await load();
    } catch (error) { status.textContent = error instanceof Error ? error.message : '保存できませんでした。'; }
    finally { save.disabled = false; }
  };
  try { await load(); } catch (error) { status.textContent = error instanceof Error ? error.message : '予約を読み込めませんでした。'; }
}
