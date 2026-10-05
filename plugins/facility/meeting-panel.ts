import { el, section, fmtDateTime, type PanelContext } from '../panel-kit.ts';
import { guestResponseLabel, meetingShareUrl } from './meeting-share.ts';
import { audienceFields, audienceLabel, field, localDateTime, requireOk, type Audience, type Facility, type Group } from './audience-fields.ts';

interface Slot { id: string; startAt: string; endAt: string; venue: string }
interface Meeting extends Audience {
  id: string; title: string; description: string; organizerName: string; onlineAllowed: boolean; guestResponses?: boolean;
  slots: Slot[]; state: string; revision: number; canManage: boolean; selectedSlot: string | null;
  responses: { id: string; name: string; canEdit: boolean; revision: number; comment: string; topic: string; answers: Record<string, string> }[];
}

export async function renderMeetings(container: HTMLElement, ctx: PanelContext, facilities: Facility[], groups: Group[]): Promise<void> {
  const formSection = section('会議の予定');
  const form = el('form', 'gl-col') as HTMLFormElement;
  const title = el('input', 'gl-input') as HTMLInputElement; title.required = true; title.maxLength = 150;
  const description = el('textarea', 'gl-input') as HTMLTextAreaElement; description.maxLength = 3000;
  const organizer = el('input', 'gl-input') as HTMLInputElement; organizer.required = true; organizer.maxLength = 80;
  organizer.value = ctx.identity.displayName ?? '';
  const online = el('input') as HTMLInputElement; online.type = 'checkbox';
  const guest = el('input') as HTMLInputElement; guest.type = 'checkbox';
  const audience = audienceFields(groups);
  const slotsArea = el('div', 'gl-col');
  const slots: { id: string; start: HTMLInputElement; end: HTMLInputElement; venue: HTMLSelectElement }[] = [];
  let editing: Meeting | null = null;
  const addSlot = (value?: Slot, copied = false): void => {
    const row = el('div', 'gl-row');
    const start = el('input', 'gl-input') as HTMLInputElement; start.type = 'datetime-local'; start.required = true;
    const end = el('input', 'gl-input') as HTMLInputElement; end.type = 'datetime-local'; end.required = true;
    const venue = el('select', 'gl-select') as HTMLSelectElement;
    venue.append(new Option('会場未定・オンライン', ''));
    facilities.forEach(item => venue.append(new Option(item.name, item.name)));
    if (value) { start.value = localDateTime(value.startAt); end.value = localDateTime(value.endAt); venue.value = value.venue; }
    const item = { id: value && !copied ? value.id : crypto.randomUUID(), start, end, venue };
    const remove = el('button', 'gl-btn ghost', '候補を削除') as HTMLButtonElement; remove.type = 'button';
    remove.onclick = () => { slots.splice(slots.indexOf(item), 1); row.remove(); };
    row.append(field('開始', start), field('終了', end), field('会場', venue), remove);
    slots.push(item); slotsArea.append(row);
  };
  const add = el('button', 'gl-btn ghost', '日時候補を追加') as HTMLButtonElement; add.type = 'button'; add.onclick = () => { if (slots.length < 100) addSlot(); };
  const save = el('button', 'gl-btn', '会議を作成') as HTMLButtonElement; save.type = 'submit';
  const reset = el('button', 'gl-btn ghost', '新しい会議') as HTMLButtonElement; reset.type = 'button';
  const status = el('p', 'gl-muted'); status.setAttribute('role', 'status');
  const resetForm = (): void => {
    editing = null; form.reset(); organizer.value = ctx.identity.displayName ?? '';
    audience.write({ visibility: 'private', group: null }); slots.splice(0); slotsArea.replaceChildren(); addSlot(); save.textContent = '会議を作成';
  };
  reset.onclick = () => { resetForm(); status.textContent = ''; };
  form.append(field('会議名', title), field('内容', description), field('主催者の表示名', organizer),
    field('オンライン参加可', online), audience.element,
    field('ログインしていない人の回答も受け付ける（公開範囲 Public のとき。共有URLから回答できます）', guest), slotsArea, add, save, reset, status);
  formSection.body.append(form); container.append(formSection.wrap); addSlot();
  const listSection = section('閲覧できる会議'); container.append(listSection.wrap);
  // Aedilis owns the canonical share page; without its public origin no link is shown.
  let publicUrl: string | undefined;
  try {
    const config = await ctx.api('/meetings/config');
    if (config.ok) publicUrl = (await config.json() as { publicUrl?: string }).publicUrl;
  } catch { publicUrl = undefined; }

  async function action(path: string, method: string, body: unknown): Promise<void> {
    await requireOk(await ctx.api(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  }
  async function run(button: HTMLButtonElement, fn: () => Promise<void>): Promise<void> {
    button.disabled = true;
    try { await fn(); await load(); }
    catch (error) { status.textContent = error instanceof Error ? error.message : '操作できませんでした。'; }
    finally { button.disabled = false; }
  }
  async function load(): Promise<void> {
    const response = await ctx.api('/meetings'); await requireOk(response);
    const { items } = await response.json() as { items: Meeting[] };
    listSection.body.replaceChildren();
    if (!items.length) listSection.body.append(el('p', 'gl-muted', '会議はありません。'));
    for (const item of items) {
      const card = el('div', 'gl-col');
      card.append(el('h3', undefined, item.title), el('p', undefined, item.description),
        el('span', 'gl-muted', `${audienceLabel(item)} · ${guestResponseLabel(item)} · ${item.state === 'finalized' ? '日時確定' : item.state === 'cancelled' ? '中止' : '日程調整中'}`));
      const shareUrl = meetingShareUrl(publicUrl, item);
      if (shareUrl && item.state !== 'cancelled') {
        const link = el('a', undefined, '共有URL（Aedilis）') as HTMLAnchorElement; link.href = shareUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
        const copyLink = el('button', 'gl-btn ghost', 'URLをコピー') as HTMLButtonElement; copyLink.type = 'button';
        copyLink.onclick = () => void navigator.clipboard.writeText(shareUrl).then(() => { status.textContent = '共有URLをコピーしました。'; }, () => { status.textContent = 'コピーできませんでした。'; });
        const share = el('div', 'gl-row'); share.append(link, copyLink); card.append(share);
      }
      const fill = (copy: boolean): void => {
        editing = copy ? null : item; title.value = item.title; description.value = item.description;
        organizer.value = copy ? ctx.identity.displayName ?? '' : item.organizerName; online.checked = item.onlineAllowed;
        guest.checked = item.guestResponses ?? false;
        audience.write(item); slots.splice(0); slotsArea.replaceChildren(); item.slots.forEach(slot => addSlot(slot, copy));
        save.textContent = copy ? 'コピーを作成' : '変更を保存';
        status.textContent = copy ? '回答と確定状態はコピーしません。日時を確認して保存してください。' : '変更すると日程調整を再開します。';
        form.scrollIntoView({ block: 'start', behavior: 'smooth' }); title.focus();
      };
      const copy = el('button', 'gl-btn ghost', 'コピー'); copy.onclick = () => fill(true); card.append(copy);
      if (item.canManage && item.state !== 'cancelled') {
        const edit = el('button', 'gl-btn ghost', '編集'); edit.onclick = () => fill(false); card.append(edit);
        const cancel = el('button', 'gl-btn ghost', '会議を中止') as HTMLButtonElement;
        cancel.onclick = () => void run(cancel, () => action(`/meetings/${encodeURIComponent(item.id)}`, 'DELETE', { revision: item.revision })); card.append(cancel);
      }
      for (const slot of item.slots) {
        const row = el('div', 'gl-row');
        row.append(el('span', undefined, `${fmtDateTime(Date.parse(slot.startAt))} 〜 ${fmtDateTime(Date.parse(slot.endAt))} ${slot.venue}${item.selectedSlot === slot.id ? ' ✓ 確定' : ''}`));
        if (item.canManage && item.state === 'open') {
          const finalize = el('button', 'gl-btn ghost', 'この日時に確定') as HTMLButtonElement;
          finalize.onclick = () => void run(finalize, () => action(`/meetings/${encodeURIComponent(item.id)}/finalize`, 'POST', { slotId: slot.id, revision: item.revision })); row.append(finalize);
        }
        card.append(row);
      }
      if (item.responses.length) card.append(el('p', 'gl-muted', `回答：${item.responses.map(answer => answer.name).join('、')}`));
      if (item.state === 'open') {
        const mine = item.responses.find(answer => answer.canEdit);
        const answers: Record<string, HTMLSelectElement> = {};
        for (const slot of item.slots) {
          const choice = el('select', 'gl-select') as HTMLSelectElement;
          choice.append(new Option('参加可', 'yes'), new Option('未定', 'maybe'), new Option('参加不可', 'no'));
          choice.value = mine?.answers[slot.id] ?? 'maybe'; answers[slot.id] = choice;
          card.append(field(fmtDateTime(Date.parse(slot.startAt)), choice));
        }
        const respond = el('button', 'gl-btn', mine ? '回答を更新' : '参加予定を回答') as HTMLButtonElement;
        respond.onclick = () => void run(respond, () => action(`/meetings/${encodeURIComponent(item.id)}/responses${mine ? '/' + encodeURIComponent(mine.id) : ''}`, mine ? 'PATCH' : 'POST', {
          name: ctx.identity.displayName ?? '参加者', comment: mine?.comment ?? '', topic: mine?.topic ?? '',
          answers: Object.fromEntries(Object.entries(answers).map(([id, select]) => [id, select.value])),
          meetingRevision: item.revision, ...(mine ? { revision: mine.revision } : {}),
        })); card.append(respond);
      }
      listSection.body.append(card);
    }
  }
  form.onsubmit = async event => {
    event.preventDefault(); save.disabled = true;
    try {
      if (!slots.length) throw new Error('日時候補を追加してください。');
      const values = slots.map(slot => {
        if (new Date(slot.start.value) >= new Date(slot.end.value)) throw new Error('終了は開始より後にしてください。');
        return { id: slot.id, startAt: new Date(slot.start.value).toISOString(), endAt: new Date(slot.end.value).toISOString(), venue: slot.venue.value };
      });
      const usedVenues = new Set(values.map(slot => slot.venue));
      const body = { ...audience.read(), title: title.value, description: description.value, organizerName: organizer.value,
        onlineAllowed: online.checked, guestResponses: guest.checked, slots: values, venues: facilities.filter(f => usedVenues.has(f.name)).map(f => ({ name: f.name, facilityId: f.id, busy: [] })),
        ...(editing ? { revision: editing.revision } : {}),
      };
      await action(editing ? `/meetings/${encodeURIComponent(editing.id)}` : '/meetings', editing ? 'PATCH' : 'POST', body);
      resetForm(); status.textContent = '会議を保存しました。'; await load();
    } catch (error) { status.textContent = error instanceof Error ? error.message : '保存できませんでした。'; }
    finally { save.disabled = false; }
  };
  try { await load(); } catch (error) { status.textContent = error instanceof Error ? error.message : '会議を読み込めませんでした。'; }
}
