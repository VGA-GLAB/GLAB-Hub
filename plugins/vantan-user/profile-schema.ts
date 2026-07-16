import { z } from 'zod';

export const vantanUserInputSchema = z.object({
  name: z.string().trim().min(1, '名前は必須です').max(200),
  roleTitle: z.string().trim().min(1, '役職は必須です').max(200),
  departmentName: z.string().trim().min(1, '学科は必須です').max(200),
}).strict();

export type VantanUserInput = z.infer<typeof vantanUserInputSchema>;

export interface VantanUserProfile {
  name: string;
  roleTitle: string;
  departmentName: string;
}

export function isCompleteVantanUserProfile(profile: VantanUserProfile): boolean {
  return [profile.name, profile.roleTitle, profile.departmentName]
    .every((value) => value.trim().length > 0);
}

export function translateVantanProfile(raw: unknown): VantanUserProfile {
  if (!raw || typeof raw !== 'object') {
    return { name: '', roleTitle: '', departmentName: '' };
  }
  const row = raw as Record<string, unknown>;
  return {
    name: typeof row.name === 'string' ? row.name : '',
    roleTitle: typeof row.role_title === 'string' ? row.role_title : '',
    departmentName: typeof row.department_name === 'string' ? row.department_name : '',
  };
}
