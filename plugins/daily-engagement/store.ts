import type { SqlDb } from '../data.ts';
import {
  assertDateKey,
  dailyQuest,
  questKeyForDate,
  type DailyQuest,
} from './catalog.ts';

export interface DailySpotlight {
  id: string;
  name: string;
  description: string | null;
  repoUrl: string | null;
}

export interface DailyContent {
  dateKey: string;
  quest: DailyQuest;
  spotlight: DailySpotlight | null;
  completed: boolean;
  discordNotifiedAt: number | null;
}

interface DailyContentRow {
  dateKey: string;
  questKey: string;
  discordNotifiedAt: number | null;
  projectId: string | null;
  projectName: string | null;
  projectDescription: string | null;
  projectRepoUrl: string | null;
}

interface SpotlightCandidateRow { id: string }

/**
 * 当日の選択を INSERT OR IGNORE で固定する。候補は累計採用回数が少なく、
 * 最終採用日が古い active project を優先するため、日々ほぼ均等に巡回する。
 * @implements SPEC-GLAB-DAILY-001
 * @implements SPEC-GLAB-DAILY-002
 * @implements SPEC-GLAB-DAILY-005
 */
export function getOrCreateDailyContent(
  db: SqlDb,
  dateKey: string,
  nowMs: number,
  userId: string | null = null,
): DailyContent {
  assertDateKey(dateKey);
  if (!Number.isFinite(nowMs)) throw new Error('nowMs must be finite');
  const normalizedUserId = userId?.trim() || null;
  const candidate = db.prepare(`SELECT p.id
    FROM glab_project p
    LEFT JOIN (
      SELECT spotlight_project_id, COUNT(*) AS selected_count, MAX(date_key) AS last_date
      FROM glab_daily_content
      WHERE spotlight_project_id IS NOT NULL
      GROUP BY spotlight_project_id
    ) history ON history.spotlight_project_id = p.id
    WHERE p.status = 'active'
    ORDER BY COALESCE(history.selected_count, 0) ASC,
      history.last_date IS NOT NULL ASC,
      history.last_date ASC,
      p.updated_at DESC,
      p.id ASC
    LIMIT 1`).get() as SpotlightCandidateRow | undefined;

  db.prepare(`INSERT INTO glab_daily_content
    (date_key, quest_key, spotlight_project_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(date_key) DO NOTHING`).run(
    dateKey,
    questKeyForDate(dateKey),
    candidate?.id ?? null,
    nowMs,
  );

  const row = readDailyContentRow(db, dateKey);
  if (!row) throw new Error(`daily content was not persisted: ${dateKey}`);
  const completed = normalizedUserId
    ? Boolean(db.prepare(`SELECT 1 FROM glab_daily_quest_completion
        WHERE date_key = ? AND user_id = ?`).get(dateKey, normalizedUserId))
    : false;
  const spotlight = row.projectId !== null && row.projectName !== null
    ? {
        id: row.projectId,
        name: row.projectName,
        description: row.projectDescription,
        repoUrl: row.projectRepoUrl,
      }
    : null;
  return {
    dateKey: row.dateKey,
    quest: dailyQuest(row.questKey, spotlight !== null),
    spotlight,
    completed,
    discordNotifiedAt: row.discordNotifiedAt,
  };
}

/** @implements SPEC-GLAB-DAILY-003 */
export function completeDailyQuest(
  db: SqlDb,
  dateKey: string,
  userId: string,
  completedAt: number,
): boolean {
  assertDateKey(dateKey);
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) throw new Error('userId is required');
  if (!Number.isFinite(completedAt)) throw new Error('completedAt must be finite');
  const result = db.prepare(`INSERT INTO glab_daily_quest_completion
    (date_key, user_id, completed_at) VALUES (?, ?, ?)
    ON CONFLICT(date_key, user_id) DO NOTHING`).run(dateKey, normalizedUserId, completedAt);
  return result.changes > 0;
}

/** @implements SPEC-GLAB-DAILY-004 */
export function markDailyDiscordNotified(
  db: SqlDb,
  dateKey: string,
  messageId: string,
  notifiedAt: number,
): boolean {
  assertDateKey(dateKey);
  if (!messageId.trim()) throw new Error('messageId is required');
  if (!Number.isFinite(notifiedAt)) throw new Error('notifiedAt must be finite');
  const result = db.prepare(`UPDATE glab_daily_content
    SET discord_notified_at = ?, discord_message_id = ?
    WHERE date_key = ? AND discord_notified_at IS NULL`).run(notifiedAt, messageId, dateKey);
  return result.changes > 0;
}

function readDailyContentRow(db: SqlDb, dateKey: string): DailyContentRow | undefined {
  return db.prepare(`SELECT
      daily.date_key AS dateKey,
      daily.quest_key AS questKey,
      daily.discord_notified_at AS discordNotifiedAt,
      project.id AS projectId,
      project.name AS projectName,
      project.description AS projectDescription,
      project.repo_url AS projectRepoUrl
    FROM glab_daily_content daily
    LEFT JOIN glab_project project ON project.id = daily.spotlight_project_id
    WHERE daily.date_key = ?`).get(dateKey) as DailyContentRow | undefined;
}
