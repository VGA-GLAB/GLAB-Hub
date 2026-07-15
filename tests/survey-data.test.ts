import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { openDb } from '../corpus/server/db.ts';
import {
  countSurveyResponses,
  createSurvey,
  ensureSchema,
  getLatestSurveyResponse,
  listSurveyResponses,
  listSurveys,
  saveSurveyResponse,
  setSurveyActive,
} from '../plugins/data.ts';

describe('survey data', () => {
  it('stores surveys and upserts one response per user', () => {
    const db = openDb(':memory:');
    try {
      ensureSchema(db);
      const survey = createSurvey(db, {
        title: 'プレイスタイル',
        description: null,
        questions: JSON.stringify([{ id: 'pace', text: '進行速度', type: 'scale' }]),
        allowMultipleResponses: false,
        createdBy: 'admin-1',
        createdAt: 100,
      });

      assert.equal(listSurveys(db).length, 1);
      saveSurveyResponse(db, survey.id, 'user-1', 'single', JSON.stringify({ pace: 2 }), 200);
      saveSurveyResponse(db, survey.id, 'user-1', 'single', JSON.stringify({ pace: 4 }), 300);

      assert.equal(listSurveyResponses(db, survey.id).length, 1);
      assert.equal(
        getLatestSurveyResponse(db, survey.id, 'user-1')?.answers,
        JSON.stringify({ pace: 4 }),
      );
      assert.equal(getLatestSurveyResponse(db, survey.id, 'user-1')?.submitted_at, 300);

      setSurveyActive(db, survey.id, false, 400);
      assert.equal(listSurveys(db).length, 0);
      assert.equal(listSurveys(db, true)[0]?.is_active, 0);
    } finally {
      db.close();
    }
  });

  it('appends independently keyed responses for a multiple-response survey', () => {
    const db = openDb(':memory:');
    try {
      ensureSchema(db);
      const survey = createSurvey(db, {
        title: '日次アンケート',
        description: null,
        questions: JSON.stringify([{ id: 'mood', text: '今日の調子', type: 'scale' }]),
        allowMultipleResponses: true,
        createdBy: 'author-1',
        createdAt: 100,
      });

      saveSurveyResponse(db, survey.id, 'user-1', 'response-1', JSON.stringify({ mood: 2 }), 200);
      saveSurveyResponse(db, survey.id, 'user-1', 'response-2', JSON.stringify({ mood: 5 }), 300);

      assert.equal(survey.allow_multiple_responses, 1);
      assert.equal(countSurveyResponses(db, survey.id, 'user-1'), 2);
      assert.equal(listSurveyResponses(db, survey.id).length, 2);
      assert.equal(
        getLatestSurveyResponse(db, survey.id, 'user-1')?.answers,
        JSON.stringify({ mood: 5 }),
      );
    } finally {
      db.close();
    }
  });

  it('migrates legacy single responses without duplicating them on repeated startup', () => {
    const db = openDb(':memory:');
    try {
      ensureSchema(db);
      const survey = createSurvey(db, {
        title: '旧アンケート',
        description: null,
        questions: JSON.stringify([{ id: 'note', text: '備考', type: 'freetext' }]),
        allowMultipleResponses: false,
        createdBy: 'admin-1',
        createdAt: 100,
      });
      db.prepare(
        `INSERT INTO glab_survey_response (survey_id, user_id, answers, submitted_at)
         VALUES (?, ?, ?, ?)`,
      ).run(survey.id, 'user-legacy', JSON.stringify({ note: 'legacy' }), 200);

      ensureSchema(db);
      ensureSchema(db);

      assert.equal(countSurveyResponses(db, survey.id, 'user-legacy'), 1);
      assert.equal(
        getLatestSurveyResponse(db, survey.id, 'user-legacy')?.answers,
        JSON.stringify({ note: 'legacy' }),
      );
    } finally {
      db.close();
    }
  });
});
