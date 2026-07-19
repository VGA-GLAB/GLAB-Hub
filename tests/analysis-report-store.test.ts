import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { ProjectRow } from '../plugins/data.ts';
import { AnalysisReportError, readAnalysisHtml, readAnalysisSummary } from '../plugins/projects/analysis-report-store.ts';

function project(name = 'SampleGame'): ProjectRow {
  return {
    id: 'project-1', name, description: null, status: 'active',
    repo_url: `https://github.com/LUDIARS/${name}.git`, created_at: 1, updated_at: 1,
  };
}

function summary(): object {
  const gaps = { missingInformation: [], missingImplementation: [] };
  const narrative = (id: string, title: string) => ({ id, title, summary: '一般読者向けの要点', ...gaps });
  const score = (label: string, value: number, marketAdvantage?: boolean, id?: string) => ({
    ...(id ? { id } : {}),
    label, score: value, maxScore: 10, rationale: '根拠', sourceRefs: ['spec/plan/review.md'], ...gaps,
    averageImprovement: { decision: value < 7 ? 'improve' : 'hold', proposal: value < 7 ? '平均的な改善' : '現状維持', rationale: 'スコアに基づく判断' },
    ...(marketAdvantage === undefined ? {} : { marketAdvantage }),
  });
  return {
    schemaVersion: 3, project: 'SampleGame', generatedAt: '2026-07-19',
    executiveAudience: {
      assumedAcademicDeviation: 50,
      audience: '専門知識のない一般読者と高校生',
      writingPolicy: ['結論から書く'],
    },
    overallAssessment: {
      label: '条件付きで有望', score: 7, maxScore: 10, summary: '中心の遊びは成立している。',
      strengths: ['遊びの核が明確'], priorityIssues: ['初見説明が不足'], confidence: '中',
      sourceRefs: ['spec/plan/review.md'], ...gaps,
    },
    executiveSummary: {
      'play-logic': narrative('play-logic', '遊びのロジック'), code: narrative('code', 'コード内容'),
      ux: narrative('ux', 'UX'), market: narrative('market', '市場分析'),
    },
    additionalAnalyses: [], aiFormatScores: [score('整合性', 7)], vitiaScores: [score('訴求力', 8, true)],
    uxEvaluation: {
      publicResponseSimulation: { audienceModel: '一般的な初見プレイヤー', assumptions: ['主要導線を体験'], limitations: ['実測ではない'] },
      scores: [
        score('体験設計のコアと実装の方向一致', 7, undefined, 'core-implementation-alignment'),
        score('表現の納得性・パフォーマンス', 6, undefined, 'expression-conviction-performance'),
      ],
    },
    playStructureScores: [
      score('発想', 8, undefined, 'idea'),
      score('構造', 7, undefined, 'structure'),
      score('量産性', 6, undefined, 'scalability'),
    ],
    ludus: {
      novelty: { score: 7, maxScore: 10, rationale: '新規性', sourceRefs: ['spec/plan/ludus.md'], averageImprovement: { decision: 'hold', proposal: '現状維持', rationale: 'スコアに基づく判断' }, ...gaps },
      recommendedImplementations: [{ title: '予告', dictionaryEntries: ['choice.telegraph'], proposal: '事前表示', uxConnection: '納得感', priority: '高', ...gaps }],
    },
  };
}

describe('Omnipotens analysis report store', () => {
  it('selects a main project folder from the registered repository and validates its summary', async () => {
    const root = await mkdtemp(join(tmpdir(), 'glab-analysis-'));
    try {
      const report = join(root, 'SampleGame', 'report');
      await mkdir(join(report, 'stages'), { recursive: true });
      await writeFile(join(report, 'omnipotens-summary.json'), JSON.stringify(summary()), 'utf8');
      await writeFile(join(report, 'omnipotens-final.html'), '<!doctype html><title>Final</title>', 'utf8');
      await writeFile(join(report, 'stages', '01-play.html'), '<!doctype html><title>Play</title>', 'utf8');

      const loaded = await readAnalysisSummary(root, project());
      assert.equal(loaded.project, 'SampleGame');
      assert.equal(loaded.schemaVersion, 3);
      assert.equal(loaded.overallAssessment.label, '条件付きで有望');
      assert.match(await readAnalysisHtml(root, project(), 'stages/01-play.html'), /Play/);
      await assert.rejects(() => readAnalysisHtml(root, project(), '../secret.html'), AnalysisReportError);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails explicitly when the configured root or normalized summary is unavailable', async () => {
    await assert.rejects(() => readAnalysisSummary(undefined, project()), /未設定/);
    const root = await mkdtemp(join(tmpdir(), 'glab-analysis-invalid-'));
    try {
      const report = join(root, 'SampleGame', 'report');
      await mkdir(report, { recursive: true });
      await assert.rejects(() => readAnalysisSummary(root, project()), (error: unknown) => (
        error instanceof AnalysisReportError && error.code === 'not_found'
      ));
      await writeFile(join(report, 'omnipotens-summary.json'), '{"schemaVersion":0}', 'utf8');
      await assert.rejects(() => readAnalysisSummary(root, project()), /検証できません/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
