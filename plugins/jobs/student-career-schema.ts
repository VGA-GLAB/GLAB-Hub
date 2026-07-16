import { z } from 'zod';

export const careerCompanySchema = z.object({
  companyId: z.string().min(1).max(100),
  companyName: z.string().min(1).max(300),
  industry: z.string().max(200).default(''),
});

export const offerCompanySchema = careerCompanySchema.extend({
  roleTitle: z.string().max(200).default(''),
  offeredOn: z.iso.date().nullable().default(null),
});

export const studentCareerPatchSchema = z.object({
  desiredRole: z.string().max(300).optional(),
  portfolioUrl: z.union([z.url(), z.literal('')]).optional(),
  careerNote: z.string().max(4_000).optional(),
  isPublic: z.boolean().optional(),
});

export type CareerCompany = z.infer<typeof careerCompanySchema>;
export type OfferCompany = z.infer<typeof offerCompanySchema>;
export type StudentCareerPatch = z.infer<typeof studentCareerPatchSchema>;
