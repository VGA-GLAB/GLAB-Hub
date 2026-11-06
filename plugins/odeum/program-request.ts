import { z } from 'zod';

/** One schema for the authorized bytes and the actual program-ticket handler. */
export const programRequestSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('producer'), projectId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/) }).strict(),
  z.object({ role: z.literal('presenter'), slot: z.enum(['input1', 'input2', 'input3', 'input4']) }).strict(),
]);
