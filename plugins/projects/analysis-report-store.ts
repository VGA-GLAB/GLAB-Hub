import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { ProjectRow } from '../data.ts';

const gapFields = {
  missingInformation: z.array(z.string()),
  missingImplementation: z.array(z.string()),
};
const narrativeSchema = z.object({
  id: z.string(), title: z.string(), beginner: z.string(), highResolution: z.string(), ...gapFields,
}).strict();
const scoreSchema = z.object({
  label: z.string(), score: z.number().nonnegative(), maxScore: z.number().positive(), rationale: z.string(),
  sourceRefs: z.array(z.string()), ...gapFields,
}).strict();
const vitiaScoreSchema = scoreSchema.extend({ marketAdvantage: z.boolean() });
const analysisSummarySchema = z.object({
  schemaVersion: z.literal(1),
  project: z.string(),
  generatedAt: z.string(),
  executiveSummary: z.object({
    'play-logic': narrativeSchema,
    code: narrativeSchema,
    ux: narrativeSchema,
    market: narrativeSchema,
  }).strict(),
  additionalAnalyses: z.array(narrativeSchema),
  aiFormatScores: z.array(scoreSchema).min(1),
  vitiaScores: z.array(vitiaScoreSchema).min(1),
  ludus: z.object({
    novelty: z.object({
      score: z.number().nonnegative(), maxScore: z.number().positive(), rationale: z.string(),
      sourceRefs: z.array(z.string()), ...gapFields,
    }).strict(),
    recommendedImplementations: z.array(z.object({
      title: z.string(), dictionaryEntries: z.array(z.string()), proposal: z.string(), uxConnection: z.string(),
      priority: z.string(), ...gapFields,
    }).strict()).min(1),
  }).strict(),
}).strict();

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

async function reportDirectory(workspaceRoot: string | undefined, project: ProjectRow): Promise<string> {
  if (!workspaceRoot?.trim()) throw new AnalysisReportError('not_configured', '解析レポートのルートが未設定です。');
  const configuredRoot = resolve(workspaceRoot);
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
  workspaceRoot: string | undefined,
  project: ProjectRow,
): Promise<AnalysisSummary> {
  const report = await reportDirectory(workspaceRoot, project);
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
  workspaceRoot: string | undefined,
  project: ProjectRow,
  requestedPath: string,
): Promise<string> {
  const portable = requestedPath.replaceAll('\\', '/');
  if (portable !== 'omnipotens-final.html' && !/^stages\/[^/]+\.html$/u.test(portable)) {
    throw new AnalysisReportError('not_found', '指定された解析ページはありません。');
  }
  const report = await reportDirectory(workspaceRoot, project);
  try {
    const candidate = await realpath(join(report, ...portable.split('/')));
    if (!isInside(report, candidate)) throw new Error('outside report directory');
    return await boundedText(candidate, 20 * 1024 * 1024);
  } catch (error) {
    if (error instanceof AnalysisReportError) throw error;
    throw new AnalysisReportError('not_found', '指定された解析ページはありません。');
  }
}
