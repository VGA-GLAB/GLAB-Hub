import { el, section } from '../panel-kit.ts';

export interface AnalysisApiClient {
  api(path: string, init?: RequestInit): Promise<Response>;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface Narrative {
  id: string;
  title: string;
  summary: string;
  missingInformation: string[];
  missingImplementation: string[];
}

interface ScoreRow {
  label: string;
  score: number;
  maxScore: number;
  rationale: string;
  sourceRefs: string[];
  marketAdvantage?: boolean;
  missingInformation: string[];
  missingImplementation: string[];
  averageImprovement: {
    decision: 'improve' | 'hold';
    proposal: string;
    rationale: string;
  };
}

interface SummaryResponse {
  summary?: {
    executiveAudience: {
      assumedAcademicDeviation: 50;
      audience: string;
      writingPolicy: string[];
    };
    overallAssessment: {
      label: string;
      score: number;
      maxScore: number;
      summary: string;
      strengths: string[];
      priorityIssues: string[];
      confidence: string;
      sourceRefs: string[];
      missingInformation: string[];
      missingImplementation: string[];
    };
    executiveSummary: Record<string, Narrative>;
    additionalAnalyses: Narrative[];
    aiFormatScores: ScoreRow[];
    vitiaScores: ScoreRow[];
    uxEvaluation: {
      publicResponseSimulation: { audienceModel: string; assumptions: string[]; limitations: string[] };
      scores: ScoreRow[];
    };
    playStructureScores: ScoreRow[];
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
  const card = el('article', 'gl-bubble');
  card.append(el('h4', undefined, item.title), el('p', undefined, item.summary));
  card.append(gapList('不足情報', item.missingInformation), gapList('不足実装', item.missingImplementation));
  return card;
}

function overallAssessmentView(summary: NonNullable<SummaryResponse['summary']>): HTMLElement {
  const item = summary.overallAssessment;
  const card = el('article', 'gl-notice');
  card.appendChild(el('h3', undefined, `総合評価：${item.label}`));
  card.appendChild(el('p', undefined, `${item.score} / ${item.maxScore}`));
  card.appendChild(el('p', undefined, item.summary));
  card.appendChild(el('strong', undefined, '主な強み'));
  card.appendChild(el('p', 'gl-muted', item.strengths.join('／')));
  card.appendChild(el('strong', undefined, '優先して解く課題'));
  card.appendChild(el('p', 'gl-muted', item.priorityIssues.join('／')));
  card.appendChild(el('p', 'gl-muted', `評価の確度: ${item.confidence}`));
  card.append(gapList('不足情報', item.missingInformation), gapList('不足実装', item.missingImplementation));
  return card;
}

function scoreTable(title: string, rows: ScoreRow[], market: boolean): HTMLElement {
  const wrap = el('div');
  wrap.appendChild(el('h3', undefined, title));
  const table = el('table', 'gl-table');
  const head = el('tr');
  for (const label of ['評価項目', 'スコア', '正直な診断', '判断', '平均的改善提案', '参照', '不足情報', '不足実装']) head.appendChild(el('th', undefined, label));
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
      el('td', undefined, row.averageImprovement.decision === 'improve' ? '改善する' : '現状維持'),
      el('td', undefined, `${row.averageImprovement.proposal}（${row.averageImprovement.rationale}）`),
      el('td', undefined, row.sourceRefs.join('／')),
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
  wrap.appendChild(el('p', undefined, `${summary.ludus.novelty.averageImprovement.decision === 'improve' ? '改善する' : '現状維持'}: ${summary.ludus.novelty.averageImprovement.proposal}（${summary.ludus.novelty.averageImprovement.rationale}）`));
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

export function createAnalysisSummarySection(projects: ProjectOption[], client: AnalysisApiClient): HTMLElement {
  const current = section('Omnipotens プロジェクトレビュー');
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
      const response = await client.api(`/projects/${encodeURIComponent(select.value)}/analysis-summary`);
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
      const audience = payload.summary.executiveAudience;
      result.appendChild(el(
        'p',
        'gl-muted',
        `一般読者・高校生向け（偏差値${audience.assumedAcademicDeviation}想定）: ${audience.audience}`,
      ));
      result.appendChild(overallAssessmentView(payload.summary));
      result.appendChild(el('h3', undefined, '各項目のまとめ'));
      const directions = [
        ...Object.values(payload.summary.executiveSummary),
        ...payload.summary.additionalAnalyses,
      ];
      for (const direction of directions) result.appendChild(narrativeView(direction));
      const boundary = el('div', 'gl-notice');
      boundary.appendChild(el('h3', undefined, '各レイヤでの解析データは以下'));
      boundary.appendChild(el('p', 'gl-muted', 'ここから先は、評価値、実装証拠、不足情報、不足実装をレイヤごとに表示します。'));
      result.appendChild(boundary);
      result.append(scoreTable('遊びの構造スコア', payload.summary.playStructureScores, false));
      const simulation = payload.summary.uxEvaluation.publicResponseSimulation;
      result.appendChild(el('h3', undefined, 'UXスコア（AI平均反応シミュレーション）'));
      result.appendChild(el('p', undefined, `想定する大衆像: ${simulation.audienceModel}`));
      result.appendChild(el('p', 'gl-muted', `前提: ${simulation.assumptions.join('／')}　限界: ${simulation.limitations.join('／')}`));
      result.append(scoreTable('UXの2軸', payload.summary.uxEvaluation.scores, false));
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
