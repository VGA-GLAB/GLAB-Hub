import { z } from 'zod';

/** Omitted event means a named standalone stream; never silently ignore an invalid event. */
export const startSchema = z.union([
  z.object({ eventId: z.number().int().positive(), mode: z.literal('program').optional() }).strict(),
  z.object({ title: z.string().trim().min(1).max(120) }).strict(),
]);
