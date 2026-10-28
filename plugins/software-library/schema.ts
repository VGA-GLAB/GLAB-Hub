// @implements SPEC-GLAB-SOFTWARE-LIBRARY-001
import { z } from 'zod';
import { distributionUrl } from './distribution-url.ts';

export const libraryId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const libraryInput = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  kind: z.enum(['runtime', 'plugin', 'sdk']),
  platform: z.enum(['windows', 'macos', 'linux', 'any']),
  version: z.string().trim().max(80),
  license: z.string().trim().max(200),
  downloadUrl: z.string().trim().max(2000),
  sha256: z.string().trim().regex(/^$|^[a-fA-F0-9]{64}$/).transform(value => value.toLowerCase()),
  published: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.downloadUrl && !distributionUrl(value.downloadUrl))
    ctx.addIssue({ code: 'custom', path: ['downloadUrl'], message: 'Use a public HTTPS link without credentials, query or fragment' });
  if (value.published && (!value.version || !value.license || !value.sha256))
    ctx.addIssue({ code: 'custom', message: 'Publication requires version, license and signed payload hash' });
});
