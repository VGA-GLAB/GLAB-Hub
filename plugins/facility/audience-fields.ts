import { el } from '../panel-kit.ts';

export interface Group { kind: 'organization' | 'team'; id: string; name: string }
export interface Audience { visibility: 'public' | 'internal' | 'private'; group: Group | null }
export interface Facility { id: string; name: string }

export function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = el('label', 'gl-col') as HTMLLabelElement;
  wrapper.append(el('span', undefined, label), control);
  return wrapper;
}

export function audienceFields(groups: Group[]): {
  element: HTMLElement; read(): Audience; write(value: Audience): void;
} {
  const element = el('div', 'gl-row');
  const group = el('select', 'gl-select') as HTMLSelectElement;
  group.append(new Option('個人', ''));
  groups.forEach((item, index) => group.append(new Option(`${item.kind === 'team' ? 'チーム' : '組織'}：${item.name}`, String(index))));
  const visibility = el('select', 'gl-select') as HTMLSelectElement;
  visibility.append(new Option('Private — 自分のみ', 'private'), new Option('Internal — 所属者のみ', 'internal'), new Option('Public — 公開', 'public'));
  element.append(field('予約する組織・チーム', group), field('公開範囲', visibility));
  return {
    element,
    read() {
      const selected = group.value === '' ? null : groups[Number(group.value)] ?? null;
      if (visibility.value === 'internal' && !selected) throw new Error('Internalには組織・チームを選択してください。');
      return { visibility: visibility.value as Audience['visibility'], group: selected };
    },
    write(value) {
      const index = groups.findIndex(item => item.kind === value.group?.kind && item.id === value.group?.id);
      group.value = index < 0 ? '' : String(index);
      // Copies cannot inherit a group the current user has left or never belonged to.
      visibility.value = value.visibility === 'internal' && index < 0 ? 'private' : value.visibility;
    },
  };
}

export function localDateTime(epoch: number | string): string {
  const date = new Date(epoch);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function audienceLabel(value: Audience): string {
  return `${value.visibility[0]?.toUpperCase()}${value.visibility.slice(1)}${value.group ? ` · ${value.group.name}` : ''}`;
}

export async function requireOk(response: Response): Promise<void> {
  if (response.ok) return;
  if (response.status === 409) throw new Error('予約が重複しているか、他の端末で更新されています。日時を確認して再読み込みしてください。');
  if (response.status === 401) throw new Error('ログインし直してください。');
  if (response.status === 403) throw new Error('操作権限または所属を確認してください。');
  if (response.status === 503) throw new Error('予約サービスまたは所属情報を取得できません。時間をおいて再度お試しください。');
  throw new Error('保存できませんでした。入力内容を確認してください。');
}
