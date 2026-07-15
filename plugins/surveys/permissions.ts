import type { CernereProjectClient } from '../cernere/project-client.ts';

const VOLPUTAS_USERS_PROJECT_KEY = 'volputas_users';
const SURVEY_AUTHORING_COLUMNS = ['can_create_surveys'] as const;

export interface SurveyPermissionReader {
  canCreateSurveys(userId: string): Promise<boolean>;
}

export class CernereSurveyPermissionReader implements SurveyPermissionReader {
  constructor(private readonly client: CernereProjectClient) {}

  async canCreateSurveys(userId: string): Promise<boolean> {
    const raw = await this.client.getUserData(
      userId,
      VOLPUTAS_USERS_PROJECT_KEY,
      [...SURVEY_AUTHORING_COLUMNS],
    );
    return hasSurveyAuthoringPermission(raw);
  }
}

export function hasSurveyAuthoringPermission(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (value as Record<string, unknown>).can_create_surveys === true;
}
