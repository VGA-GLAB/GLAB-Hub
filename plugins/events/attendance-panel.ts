import { el, type PanelContext } from '../panel-kit.ts';

interface AttendanceView {
  date: string; today: boolean; present: { displayName: string }[]; absent: { displayName: string }[];
  mine: 'present' | 'absent' | 'unknown'; canReport: boolean;
}

/** Authenticated GLAB surface. The Ae share URL deliberately has no attendance mutation. */
export function eventAttendanceControls(ctx: PanelContext, eventId: number): HTMLElement {
  const box = el('div', 'gl-col'), status = el('p', 'gl-muted');
  status.setAttribute('role', 'status');
  const load = el('button', 'gl-btn ghost', '出席・欠席を確認'); load.type = 'button';
  const report = el('button', 'gl-btn ghost', '欠席を連絡'); report.type = 'button'; report.hidden = true;
  let state: AttendanceView | null = null;
  const run = async (absent?: boolean): Promise<void> => {
    load.disabled = true; report.disabled = true;
    try {
      const response = await ctx.api(`/events/${eventId}/attendance`, absent === undefined ? undefined : {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ absent }),
      });
      if (!response.ok) throw new Error(response.status === 401 ? '出欠の確認・欠席連絡にはログインが必要です。' : '出欠を更新できませんでした。');
      state = await response.json() as AttendanceView;
      const names = (items: { displayName: string }[]): string => items.map(item => item.displayName).join('、') || 'なし';
      status.textContent = `${state.date}${state.today ? '（本日）' : ''} 出席確認済み：${names(state.present)} ／ 欠席連絡：${names(state.absent)}。未回答は欠席に含めません。出席は当日「出席」画面からチェックインしてください。`;
      report.textContent = state.mine === 'absent' ? '欠席連絡を取り消す' : '欠席を連絡';
      report.hidden = !state.canReport || state.mine === 'present';
    } catch (error) { status.textContent = error instanceof Error ? error.message : '出欠を取得できませんでした。'; }
    finally { load.disabled = false; report.disabled = false; }
  };
  load.onclick = () => void run();
  report.onclick = () => void run(state?.mine !== 'absent');
  box.append(load, report, status);
  return box;
}
