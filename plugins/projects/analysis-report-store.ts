import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { ProjectRow } from '../data.ts';

const gapFields = {
  missingInformation: z.array(z.string()),
  missingImplementation: z.array(z.string()),
};
const averageImprovementSchema = z.object({
  decision: z.enum(['improve', 'hold']),
  proposal: z.string(),
  rationale: z.string(),
}).strict();
const narrativeV3Schema = z.object({
  id: z.string(), title: z.string(), summary: z.string(), ...gapFields,
}).strict();
const narrativeV4Schema = z.object({
  id: z.string(), title: z.string(), beginner: z.string(), highResolution: z.string(), ...gapFields,
}).strict();
const scoreSchema = z.object({
  label: z.string(), score: z.number().nonnegative(), maxScore: z.number().positive(), rationale: z.string(),
  sourceRefs: z.array(z.string()), ...gapFields,
  averageImprovement: averageImprovementSchema,
}).strict();
const vitiaScoreSchema = scoreSchema.extend({ marketAdvantage: z.boolean() });
const overallAssessmentFields = {
  label: z.string(),
  score: z.number().nonnegative(),
  maxScore: z.number().positive(),
  confidence: z.string(),
  sourceRefs: z.array(z.string()),
  ...gapFields,
};
const assessmentProfileSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).min(1),
  priorityIssues: z.array(z.string()).min(1),
}).strict();
const executiveDirections = <T extends z.ZodType>(narrative: T) => z.object({
  'play-logic': narrative,
  code: narrative,
  ux: narrative,
  market: narrative,
}).strict();
const analysisLayerFields = {
  aiFormatScores: z.array(scoreSchema).min(1),
  vitiaScores: z.array(vitiaScoreSchema).min(1),
  uxEvaluation: z.object({
    publicResponseSimulation: z.object({
      audienceModel: z.string(),
      assumptions: z.array(z.string()).min(1),
      limitations: z.array(z.string()).min(1),
    }).strict(),
    scores: z.tuple([
      scoreSchema.extend({ id: z.literal('core-implementation-alignment') }),
      scoreSchema.extend({ id: z.literal('expression-conviction-performance') }),
    ]),
  }).strict(),
  playStructureScores: z.tuple([
    scoreSchema.extend({ id: z.literal('idea') }),
    scoreSchema.extend({ id: z.literal('structure') }),
    scoreSchema.extend({ id: z.literal('scalability') }),
  ]),
  ludus: z.object({
    novelty: z.object({
      score: z.number().nonnegative(), maxScore: z.number().positive(), rationale: z.string(),
      sourceRefs: z.array(z.string()), ...gapFields,
      averageImprovement: averageImprovementSchema,
    }).strict(),
    recommendedImplementations: z.array(z.object({
      title: z.string(), dictionaryEntries: z.array(z.string()), proposal: z.string(), uxConnection: z.string(),
      priority: z.string(), ...gapFields,
    }).strict()).min(1),
  }).strict(),
};
const analysisSummaryV3Schema = z.object({
  schemaVersion: z.literal(3),
  project: z.string(),
  generatedAt: z.string(),
  executiveAudience: z.object({
    assumedAcademicDeviation: z.literal(50),
    audience: z.string(),
    writingPolicy: z.array(z.string()).min(1),
  }).strict(),
  overallAssessment: z.object({
    ...overallAssessmentFields,
    summary: z.string(),
    strengths: z.array(z.string()).min(1),
    priorityIssues: z.array(z.string()).min(1),
  }).strict().refine((value) => value.score <= value.maxScore),
  executiveSummary: executiveDirections(narrativeV3Schema),
  additionalAnalyses: z.array(narrativeV3Schema),
  ...analysisLayerFields,
}).strict();
const analysisSummaryV4Schema = z.object({
  schemaVersion: z.literal(4),
  project: z.string(),
  generatedAt: z.string(),
  overallAssessment: z.object({
    ...overallAssessmentFields,
    beginner: assessmentProfileSchema,
    highResolution: assessmentProfileSchema,
  }).strict().refine((value) => value.score <= value.maxScore),
  executiveSummary: executiveDirections(narrativeV4Schema),
  additionalAnalyses: z.array(narrativeV4Schema),
  ...analysisLayerFields,
}).strict();
const analysisSummarySchema = z.discriminatedUnion('schemaVersion', [analysisSummaryV3Schema, analysisSummaryV4Schema]);

export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

export class AnalysisReportError extends Error {
  constructor(readonly code: 'not_configured' | 'not_found' | 'invalid_report', message: string) {
    super(message);
  }
}

function isInside(root: string, candidate: string): boolean {
  const fromRoot = relative(root.toLocaleLowerCase('en-US'), candidate.toLocaleLowerCase('en-US'));
  return fromRoot === '' || (!isAbsolute(fromRoot) && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`));
}

function safeProjectSegment(value: string): string | null {
  const segment = value.trim().replace(/\.git$/i, '');
  if (!segment || segment === '.' || segment === '..' || segment.startsWith('.') || /[\\/\0]/.test(segment)) return null;
  return segment;
}

function projectSegments(project: ProjectRow): string[] {
  const segments: string[] = [];
  if (project.repo_url) {
    try {
      const pathParts = new URL(project.repo_url).pathname.split('/').filter(Boolean);
      const repoSegment = safeProjectSegment(pathParts.at(-1) ?? '');
      if (repoSegment) segments.push(repoSegment);
    } catch {
      // The registry validates URLs on write. Ignore legacy malformed rows and try the project name.
    }
  }
  const nameSegment = safeProjectSegment(project.name);
  if (nameSegment && !segments.includes(nameSegment)) segments.push(nameSegment);
  return segments;
}

async function reportDirectory(reviewRoot: string | undefined, project: ProjectRow): Promise<string> {
  if (!reviewRoot?.trim()) throw new AnalysisReportError('not_configured', 'Omnipotens Reviewルートが未設定です。');
  const configuredRoot = resolve(reviewRoot);
  let root: string;
  try {
    root = await realpath(configuredRoot);
  } catch {
    throw new AnalysisReportError('not_configured', '解析レポートのルートを参照できません。');
  }
  for (const segment of projectSegments(project)) {
    const projectPath = join(root, segment);
    try {
      if ((await lstat(projectPath)).isSymbolicLink()) continue;
      const resolvedProject = await realpath(projectPath);
      const reportPath = join(resolvedProject, 'report');
      if ((await lstat(reportPath)).isSymbolicLink()) continue;
      const resolvedReport = await realpath(reportPath);
      if (isInside(root, resolvedProject) && isInside(resolvedProject, resolvedReport)) return resolvedReport;
    } catch {
      // Try the next registry-derived candidate.
    }
  }
  throw new AnalysisReportError('not_found', 'このプロジェクトの解析レポートは見つかりません。');
}

async function boundedText(path: string, maximumBytes: number): Promise<string> {
  const info = await stat(path);
  if (!info.isFile() || info.size > maximumBytes) {
    throw new AnalysisReportError('invalid_report', '解析レポートのファイル形式またはサイズが不正です。');
  }
  return readFile(path, 'utf8');
}

export async function readAnalysisSummary(
  reviewRoot: string | undefined,
  project: ProjectRow,
): Promise<AnalysisSummary> {
  const report = await reportDirectory(reviewRoot, project);
  try {
    const summaryPath = join(report, 'omnipotens-summary.json');
    if ((await lstat(summaryPath)).isSymbolicLink()) throw new Error('summary must not be a symbolic link');
    const resolvedSummary = await realpath(summaryPath);
    if (!isInside(report, resolvedSummary)) throw new Error('summary outside report directory');
    const raw = JSON.parse(await boundedText(resolvedSummary, 2 * 1024 * 1024));
    return analysisSummarySchema.parse(raw);
  } catch (error) {
    if (error instanceof AnalysisReportError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AnalysisReportError('not_found', 'このプロジェクトの解析サマリはまだ生成されていません。');
    }
    throw new AnalysisReportError('invalid_report', '解析サマリを検証できません。');
  }
}

export async function readAnalysisHtml(
  reviewRoot: string | undefined,
  project: ProjectRow,
  requestedPath: string,
): Promise<string> {
  const portable = requestedPath.replaceAll('\\', '/');
  if (portable !== 'omnipotens-final.html' && !/^stages\/[^/]+\.html$/u.test(portable)) {
    throw new AnalysisReportError('not_found', '指定された解析ページはありません。');
  }
  const report = await reportDirectory(reviewRoot, project);
  try {
    const candidate = await realpath(join(report, ...portable.split('/')));
    if (!isInside(report, candidate)) throw new Error('outside report directory');
    return await boundedText(candidate, 20 * 1024 * 1024);
  } catch (error) {
    if (error instanceof AnalysisReportError) throw error;
    throw new AnalysisReportError('not_found', '指定された解析ページはありません。');
  }
}
