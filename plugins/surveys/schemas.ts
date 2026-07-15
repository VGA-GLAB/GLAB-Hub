import { z } from 'zod';

const questionBaseSchema = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/),
  text: z.string().trim().min(1).max(500),
  dimension: z.string().trim().min(1).max(100).optional(),
}).strict();

const scaleQuestionSchema = questionBaseSchema.extend({
  type: z.literal('scale'),
  options: z.object({
    min: z.number().int().min(-100).max(100).default(1),
    max: z.number().int().min(-100).max(100).default(5),
  }).strict().optional(),
});

const choiceQuestionSchema = questionBaseSchema.extend({
  type: z.literal('choice'),
  options: z.object({
    choices: z.array(z.string().trim().min(1).max(200)).min(2).max(50).superRefine(
      (choices, ctx) => {
        if (new Set(choices).size !== choices.length) {
          ctx.addIssue({ code: 'custom', message: 'choices must be unique' });
        }
      },
    ),
  }).strict(),
});

const freeTextQuestionSchema = questionBaseSchema.extend({
  type: z.literal('freetext'),
  options: z.undefined().optional(),
});

export const surveyQuestionSchema = z.discriminatedUnion('type', [
  scaleQuestionSchema,
  choiceQuestionSchema,
  freeTextQuestionSchema,
]);

export const surveyQuestionsSchema = z.array(surveyQuestionSchema).min(1).max(100).superRefine(
  (questions, ctx) => {
    const ids = new Set<string>();
    questions.forEach((question, index) => {
      if (ids.has(question.id)) {
        ctx.addIssue({
          code: 'custom',
          message: 'question ids must be unique',
          path: [index, 'id'],
        });
      }
      ids.add(question.id);
      if (question.type === 'scale') {
        const min = question.options?.min ?? 1;
        const max = question.options?.max ?? 5;
        if (min >= max) {
          ctx.addIssue({
            code: 'custom',
            message: 'scale min must be less than max',
            path: [index, 'options'],
          });
        }
      }
    });
  },
);

export const createSurveyInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(4000).nullable().optional(),
  questions: surveyQuestionsSchema,
  allowMultipleResponses: z.boolean().optional().default(false),
}).strict();

export const surveyActiveInputSchema = z.object({
  active: z.boolean(),
}).strict();

export const surveyAnswersInputSchema = z.object({
  answers: z.record(
    z.string().trim().min(1).max(100),
    z.union([z.string().max(4000), z.number().finite()]),
  ),
}).strict();

export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;
export type SurveyAnswers = Record<string, string | number>;

export function parseStoredQuestions(value: string): SurveyQuestion[] {
  return surveyQuestionsSchema.parse(JSON.parse(value) as unknown);
}

export function parseStoredAnswers(value: string): SurveyAnswers {
  return surveyAnswersInputSchema.shape.answers.parse(JSON.parse(value) as unknown);
}

export function validateSurveyAnswers(
  questions: SurveyQuestion[],
  answers: SurveyAnswers,
): boolean {
  const byId = new Map(questions.map((question) => [question.id, question]));
  for (const [questionId, value] of Object.entries(answers)) {
    const question = byId.get(questionId);
    if (!question) return false;
    if (question.type === 'freetext') {
      if (typeof value !== 'string') return false;
      continue;
    }
    if (question.type === 'choice') {
      if (typeof value !== 'string' || !question.options.choices.includes(value)) return false;
      continue;
    }
    const min = question.options?.min ?? 1;
    const max = question.options?.max ?? 5;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      return false;
    }
  }
  return true;
}
