import { randomUUID } from 'node:crypto';
import {
  Hono,
  getIdentity,
  requireAdmin,
} from '../../corpus/server/hub/sdk.ts';
import type { CorpusContext, CorpusDb, CorpusModule } from '../../corpus/server/hub/sdk.ts';
import {
  countSurveyResponses,
  createSurvey,
  ensureGlabUser,
  ensureSchema,
  getSurvey,
  getLatestSurveyResponse,
  listSurveyResponses,
  listSurveys,
  setSurveyActive,
  saveSurveyResponse,
  type SurveyResponseRow,
  type SurveyRow,
} from '../data.ts';
import {
  createSurveyInputSchema,
  parseStoredAnswers,
  parseStoredQuestions,
  surveyActiveInputSchema,
  surveyAnswersInputSchema,
  validateSurveyAnswers,
} from './schemas.ts';
import { createCernereProjectClient } from '../cernere/create-client.ts';
import {
  CernereSurveyPermissionReader,
  type SurveyPermissionReader,
} from './permissions.ts';

function surveyView(row: SurveyRow): Record<string, unknown> {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    questions: parseStoredQuestions(row.questions),
    active: row.is_active === 1,
    allowMultipleResponses: row.allow_multiple_responses === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function responseView(row: SurveyResponseRow): Record<string, unknown> {
  return {
    id: row.id,
    surveyId: row.survey_id,
    userId: row.user_id,
    answers: parseStoredAnswers(row.answers),
    submittedAt: row.submitted_at,
  };
}

function surveyId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function makeRoutes(
  ctx: CorpusContext,
  permissions: SurveyPermissionReader,
  now: () => number = Date.now,
  newResponseKey: () => string = randomUUID,
): Hono {
  const db: CorpusDb = ctx.db;
  const router = new Hono();

  router.get('/', (c) => {
    const identity = getIdentity(c);
    const includeInactive = c.req.query('all') === '1' && identity.isAdmin;
    return c.json({ surveys: listSurveys(db, includeInactive).map(surveyView) });
  });

  router.get('/permissions', async (c) => {
    try {
      const identity = getIdentity(c);
      return c.json({ canCreateSurveys: await permissions.canCreateSurveys(identity.userId) });
    } catch (error) {
      ctx.logger.error(`survey permission read failed: ${errorMessage(error)}`);
      return c.json({ error: 'cernere_unavailable' }, 503);
    }
  });

  router.post('/', async (c) => {
    const identity = getIdentity(c);
    try {
      if (!await permissions.canCreateSurveys(identity.userId)) {
        return c.json({ error: 'survey_creation_forbidden' }, 403);
      }
    } catch (error) {
      ctx.logger.error(`survey permission read failed: ${errorMessage(error)}`);
      return c.json({ error: 'cernere_unavailable' }, 503);
    }
    const parsed = createSurveyInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_survey' }, 400);
    const created = createSurvey(db, {
      title: parsed.data.title,
      description: parsed.data.description || null,
      questions: JSON.stringify(parsed.data.questions),
      allowMultipleResponses: parsed.data.allowMultipleResponses,
      createdBy: identity.userId,
      createdAt: now(),
    });
    return c.json({ survey: surveyView(created) }, 201);
  });

  router.patch('/:id/active', requireAdmin, async (c) => {
    const id = surveyId(c.req.param('id'));
    if (id == null) return c.json({ error: 'invalid_survey_id' }, 400);
    const parsed = surveyActiveInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_active_state' }, 400);
    const updated = setSurveyActive(db, id, parsed.data.active, now());
    if (!updated) return c.json({ error: 'not_found' }, 404);
    return c.json({ survey: surveyView(updated) });
  });

  router.get('/:id/response', (c) => {
    const id = surveyId(c.req.param('id'));
    if (id == null) return c.json({ error: 'invalid_survey_id' }, 400);
    const survey = getSurvey(db, id);
    const identity = getIdentity(c);
    if (!survey || (survey.is_active !== 1 && !identity.isAdmin)) {
      return c.json({ error: 'not_found' }, 404);
    }
    const response = getLatestSurveyResponse(db, id, identity.userId);
    if (!response) return c.json({ error: 'not_found' }, 404);
    return c.json({
      response: responseView(response),
      responseCount: countSurveyResponses(db, id, identity.userId),
    });
  });

  router.put('/:id/response', async (c) => {
    const id = surveyId(c.req.param('id'));
    if (id == null) return c.json({ error: 'invalid_survey_id' }, 400);
    const survey = getSurvey(db, id);
    if (!survey || survey.is_active !== 1) return c.json({ error: 'not_found' }, 404);
    const parsed = surveyAnswersInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'invalid_answers' }, 400);
    const questions = parseStoredQuestions(survey.questions);
    if (!validateSurveyAnswers(questions, parsed.data.answers)) {
      return c.json({ error: 'invalid_answers' }, 400);
    }
    const identity = getIdentity(c);
    ensureGlabUser(db, identity.userId);
    const response = saveSurveyResponse(
      db,
      id,
      identity.userId,
      survey.allow_multiple_responses === 1 ? newResponseKey() : 'single',
      JSON.stringify(parsed.data.answers),
      now(),
    );
    return c.json({
      response: responseView(response),
      responseCount: countSurveyResponses(db, id, identity.userId),
    });
  });

  router.get('/:id/responses', requireAdmin, (c) => {
    const id = surveyId(c.req.param('id'));
    if (id == null) return c.json({ error: 'invalid_survey_id' }, 400);
    if (!getSurvey(db, id)) return c.json({ error: 'not_found' }, 404);
    return c.json({ responses: listSurveyResponses(db, id).map(responseView) });
  });

  return router;
}

const surveysModule: CorpusModule = {
  id: 'surveys',
  title: 'アンケート',
  icon: '📝',
  setup(ctx: CorpusContext) {
    ensureSchema(ctx.db);
    const permissions = new CernereSurveyPermissionReader(createCernereProjectClient(ctx));
    ctx.registerRoute(makeRoutes(ctx, permissions));
    ctx.registerPanel({ title: 'アンケート', icon: '📝' });
    ctx.logger.info('surveys ready (Voluptas-compatible question and response model)');
  },
};

export default surveysModule;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
