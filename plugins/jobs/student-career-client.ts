import type { CernereProjectClient } from '../cernere/project-client.ts';
import {
  careerCompanySchema,
  offerCompanySchema,
  type CareerCompany,
  type OfferCompany,
  type StudentCareerPatch,
} from './student-career-schema.ts';

const PROJECT_KEY = 'tirocinium_student_career';
const COLUMNS = [
  'desired_companies',
  'offer_companies',
  'desired_role',
  'portfolio_url',
  'career_note',
  'is_public',
] as const;

export interface StudentCareer {
  desiredCompanies: CareerCompany[];
  offerCompanies: OfferCompany[];
  desiredRole: string;
  portfolioUrl: string;
  careerNote: string;
  isPublic: boolean;
}

export async function getStudentCareer(
  client: CernereProjectClient,
  userId: string,
): Promise<StudentCareer> {
  const raw = await client.getUserData(userId, PROJECT_KEY, [...COLUMNS]);
  const fields = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    desiredCompanies: parseArray(fields.desired_companies, careerCompanySchema),
    offerCompanies: parseArray(fields.offer_companies, offerCompanySchema),
    desiredRole: text(fields.desired_role),
    portfolioUrl: text(fields.portfolio_url),
    careerNote: text(fields.career_note),
    isPublic: fields.is_public === true,
  };
}

export async function setStudentCareer(
  client: CernereProjectClient,
  userId: string,
  patch: StudentCareerPatch,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (patch.desiredRole !== undefined) data.desired_role = patch.desiredRole;
  if (patch.portfolioUrl !== undefined) data.portfolio_url = patch.portfolioUrl;
  if (patch.careerNote !== undefined) data.career_note = patch.careerNote;
  if (patch.isPublic !== undefined) data.is_public = patch.isPublic;
  if (Object.keys(data).length === 0) return;
  await client.setUserData(userId, PROJECT_KEY, data);
}

export async function setCareerCompanies(
  client: CernereProjectClient,
  userId: string,
  desiredCompanies: CareerCompany[],
  offerCompanies: OfferCompany[],
): Promise<void> {
  await client.setUserData(userId, PROJECT_KEY, {
    desired_companies: desiredCompanies,
    offer_companies: offerCompanies,
  });
}

function parseArray<T>(
  value: unknown,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
): T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
