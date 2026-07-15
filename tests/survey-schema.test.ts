import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createSurveyInputSchema,
  surveyQuestionsSchema,
  validateSurveyAnswers,
} from '../plugins/surveys/schemas.ts';

const questions = surveyQuestionsSchema.parse([
  {
    id: 'challenge',
    text: '難しい課題が好きですか？',
    type: 'scale',
    options: { min: 1, max: 5 },
  },
  {
    id: 'genre',
    text: '好きなジャンルは？',
    type: 'choice',
    options: { choices: ['RPG', 'Action'] },
  },
  {
    id: 'comment',
    text: 'コメント',
    type: 'freetext',
  },
]);

describe('survey schemas', () => {
  it('accepts Voluptas scale, choice, and freetext answers', () => {
    assert.equal(validateSurveyAnswers(questions, {
      challenge: 4,
      genre: 'RPG',
      comment: '協力プレイが好き',
    }), true);
  });

  it('rejects unknown questions and values outside their definition', () => {
    assert.equal(validateSurveyAnswers(questions, { challenge: 6 }), false);
    assert.equal(validateSurveyAnswers(questions, { genre: 'Puzzle' }), false);
    assert.equal(validateSurveyAnswers(questions, { unknown: 'value' }), false);
  });

  it('rejects duplicate question ids and inverted scale ranges', () => {
    const parsed = surveyQuestionsSchema.safeParse([
      { id: 'same', text: 'A', type: 'freetext' },
      { id: 'same', text: 'B', type: 'scale', options: { min: 5, max: 1 } },
    ]);
    assert.equal(parsed.success, false);
  });

  it('defaults to one response and accepts an explicit multiple-response setting', () => {
    const single = createSurveyInputSchema.parse({ title: 'Single', questions });
    const multiple = createSurveyInputSchema.parse({
      title: 'Multiple',
      questions,
      allowMultipleResponses: true,
    });

    assert.equal(single.allowMultipleResponses, false);
    assert.equal(multiple.allowMultipleResponses, true);
  });
});
