import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isPlayProgress,
  parseCreatedReviewId,
  parseFollowUpQuestion,
  parseVoiceAnalysis,
} from '../plugins/volputas/review-follow-up-contract.ts';

test('the created review id is read from the Voluptas 201 body', () => {
  assert.equal(parseCreatedReviewId({ ok: true, data: { record: { id: 'v1', comment: 'x' } } }), 'v1');
  assert.equal(parseCreatedReviewId({ ok: true, data: { record: {} } }), null);
  assert.equal(parseCreatedReviewId(null), null);
});

test('only the five play progress values are sent', () => {
  assert.equal(isPlayProgress('cleared'), true);
  assert.equal(isPlayProgress('post-clear'), true);
  assert.equal(isPlayProgress(''), false);
  assert.equal(isPlayProgress('ending'), false);
});

test('a follow-up question is drawn only when its shape is valid, and null means done', () => {
  const choice = {
    id: 'sentiment', prompt: '全体としてどう感じましたか？', answerType: 'choice',
    options: [{ value: '0', label: '中立' }, { value: '2', label: '強く好意的' }],
  };
  assert.deepEqual(parseFollowUpQuestion({ ok: true, data: { question: choice } }), choice);
  assert.deepEqual(
    parseFollowUpQuestion({ ok: true, data: { question: { id: 'highlight', prompt: '一番の場面は？', answerType: 'text' } } }),
    { id: 'highlight', prompt: '一番の場面は？', answerType: 'text', options: [] },
  );
  assert.equal(parseFollowUpQuestion({ ok: true, data: { question: null } }), null);
  assert.equal(parseFollowUpQuestion({ ok: true, data: {} }), undefined);
  assert.equal(parseFollowUpQuestion({ ok: true, data: { question: { ...choice, options: [] } } }), undefined);
  assert.equal(parseFollowUpQuestion({ ok: true, data: { question: { ...choice, answerType: 'html' } } }), undefined);
});

test('the analysis view keeps state, event labels with valence and the observation count only', () => {
  const body = {
    ok: true,
    data: {
      state: 'complete',
      analysis: {
        events: [
          { id: 'e1', label: '最初のボス戦', valence: 'positive', evidence: [{ text: '原文' }] },
          { id: 'e2', label: '長いロード', valence: 'sideways' },
          { id: 'e3' },
        ],
        observations: [{ id: 'o1' }, { id: 'o2' }],
      },
      previousAnalyzedAt: null,
    },
  };
  assert.deepEqual(parseVoiceAnalysis(body), {
    state: 'complete',
    events: [{ label: '最初のボス戦', valence: 'positive' }, { label: '長いロード', valence: null }],
    observationCount: 2,
  });
  assert.deepEqual(parseVoiceAnalysis({ ok: true, data: { state: 'not_analyzed', analysis: null } }),
    { state: 'not_analyzed', events: [], observationCount: 0 });
  assert.equal(parseVoiceAnalysis({ ok: true, data: { state: 'done' } }), null);
});
