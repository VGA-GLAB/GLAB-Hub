import { el, section, type PanelContext } from '../panel-kit.ts';

interface ProjectOption {
  id: string;
  name: string;
}

interface Narrative {
  id: string;
  title: string;
  beginner: string;
  highResolution: string;
  missingInformation: string[];
  missingImplementation: string[];
}

interface ScoreRow {
  label: string;
  score: number;
  maxScore: number;
  rationale: string;
  marketAdvantage?: boolean;
  missingInformation: string[];
  missingImplementation: string[];
}

interface SummaryResponse {
  summary?: {
    executiveSummary: Record<string, Narrative>;
    additionalAnalyses: Narrative[];
    aiFormatScores: ScoreRow[];
    vitiaScores: ScoreRow[];
    ludus: {
      novelty: Omit<ScoreRow, 'label' | 'marketAdvantage'>;
      recommendedImplementations: Array<{
        title: string;
        dictionaryEntries: string[];
        proposal: string;
        uxConnection: string;
        priority: string;
        missingInformation: string[];
        missingImplementation: string[];
      }>;
    };
  };
  reportUrl?: string;
  message?: string;
}

function gapList(title: string, items: string[]): HTMLElement {
  const wrap = el('div');
  wrap.appendChild(el('strong', undefined, title));
  wrap.appendChild(el('p', 'gl-muted', items.length ? items.join('／') : 'なし（現時点の証拠範囲）'));
  return wrap;
}

function narrativeView(item: Narrative): HTMLElement {
  const details = el('details', 'gl-bubble') as HTMLDetailsElement;
  const heading = el('summary', undefined, item.title);
  details.append(heading, el('h4', undefined, '学生・初学者向け'), el('p', undefined, item.beginner));
  details.append(el('h4', undefined, '高解像度データ'), el('p', undefined, item.highResolution));
  details.append(gapList('不足情報', item.missingInformation), gapList('不足実装', item.missingImplementation));
  return details;
}

function scoreTable(title: string, rows: ScoreRow[], market: boolean): HTMLElement {
  const wrap = el('div');
  wrap.appendChild(el('h3', undefined, title));
  const table = el('table', 'gl-table');
  const head = el('tr');
  for (const label of ['評価項目', 'スコア', '根拠', '不足情報', '不足実装']) head.appendChild(el('th', undefined, label));
  const thead = el('thead');
  thead.appendChild(head);
  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    const name = el('td');
    name.appendChild(el(market && row.marketAdvantage ? 'strong' : 'span', undefined, row.label));
    tr.append(
      name,
      el('td', undefined, `${row.score} / ${row.maxScore}`),
      el('td', undefined, row.rationale),
      el('td', undefined, row.missingInformation.join('／') || 'なし'),
      el('td', undefined, row.missingImplementation.join('／') || 'なし'),
    );
    tbody.appendChild(tr);
  }
  table.append(thead, tbody);
  wrap.appendChild(table);
  return wrap;
}

function ludusView(summary: NonNullable<SummaryResponse['summary']>): HTMLElement {
  const wrap = el('div');
  wrap.appendChild(el('h3', undefined, 'Ludus 新規性評価'));
  wrap.appendChild(el('p', undefined, `${summary.ludus.novelty.score} / ${summary.ludus.novelty.maxScore} — ${summary.ludus.novelty.rationale}`));
  wrap.append(gapList('不足情報', summary.ludus.novelty.missingInformation), gapList('不足実装', summary.ludus.novelty.missingImplementation));
  wrap.appendChild(el('h3', undefined, '遊びの辞書からUXへつなぐ実装提案'));
  for (const item of summary.ludus.recommendedImplementations) {
    const details = el('details', 'gl-bubble') as HTMLDetailsElement;
    details.appendChild(el('summary', undefined, item.title));
    details.append(el('p', undefined, item.proposal));
    details.append(el('p', 'gl-muted', `遊びの辞書: ${item.dictionaryEntries.join('／')}`));
    details.append(el('p', undefined, `UXへの接続: ${item.uxConnection}`));
    details.append(el('p', 'gl-muted', `優先度: ${item.priority}`));
    details.append(gapList('不足情報', item.missingInformation), gapList('不足実装', item.missingImplementation));
    wrap.appendChild(details);
  }
  return wrap;
}

export function createAnalysisSummarySection(projects: ProjectOption[], ctx: PanelContext): HTMLElement {
  const current = section('Omnipotens 解析サマリ');
  const controls = el('div', 'gl-row');
  const select = el('select', 'gl-select') as HTMLSelectElement;
  for (const project of projects) {
    const option = el('option', undefined, project.name) as HTMLOptionElement;
    option.value = project.id;
    select.appendChild(option);
  }
  const load = el('button', 'gl-btn', '解析結果を表示');
  const result = el('div');

  load.onclick = async () => {
    load.setAttribute('disabled', 'true');
    result.replaceChildren(el('p', 'gl-muted', '解析サマリを読み込み中…'));
    try {
      const response = await ctx.api(`/projects/${encodeURIComponent(select.value)}/analysis-summary`);
      const payload = await response.json() as SummaryResponse;
      if (!response.ok || !payload.summary) {
        result.replaceChildren(el('p', 'gl-muted', payload.message ?? `解析結果を取得できませんでした (${response.status})。`));
        return;
      }
      result.replaceChildren();
      if (payload.reportUrl) {
        const link = el('a', 'gl-btn ghost', '最終HTMLレポートを開く') as HTMLAnchorElement;
        link.href = payload.reportUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        result.appendChild(link);
      }
      const directions = [
        ...Object.values(payload.summary.executiveSummary),
        ...payload.summary.additionalAnalyses,
      ];
      for (const direction of directions) result.appendChild(narrativeView(direction));
      result.append(scoreTable('AI Format スコア', payload.summary.aiFormatScores, false));
      result.append(scoreTable('Vitia 市場性スコア（高い順）', payload.summary.vitiaScores, true));
      result.append(ludusView(payload.summary));
    } catch {
      result.replaceChildren(el('p', 'gl-muted', '解析結果の取得に失敗しました。'));
    } finally {
      load.removeAttribute('disabled');
    }
  };

  controls.append(select, load);
  current.body.append(controls, result);
  return current.wrap;
}
