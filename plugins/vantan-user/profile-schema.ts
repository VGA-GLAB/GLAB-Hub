import { z } from 'zod';

export const vantanUserInputSchema = z.object({
  name: z.string().trim().min(1, '名前は必須です').max(200),
  roleTitle: z.string().trim().min(1, '役職は必須です').max(200),
  memberType: z.enum(['student', 'alumni']),
  nickname: z.string().trim().max(200).default(''),
  departmentName: z.string().trim().max(200).default(''),
  grade: z.number().int().positive().max(2147483647).nullable().default(null),
  company: z.string().trim().max(200).default(''),
}).strict().superRefine((profile, ctx) => {
  if (profile.memberType !== 'student') return;
  if (!profile.departmentName) ctx.addIssue({ code: 'custom', path: ['departmentName'], message: '学科は必須です' });
  if (profile.grade === null) ctx.addIssue({ code: 'custom', path: ['grade'], message: '学年は必須です' });
});

export type VantanUserInput = z.infer<typeof vantanUserInputSchema>;

export interface VantanUserProfile {
  name: string;
  roleTitle: string;
  departmentName: string;
  memberType: 'student' | 'alumni' | null;
  nickname: string;
  grade: number | null;
  company: string;
}

export function isCompleteVantanUserProfile(profile: VantanUserProfile): boolean {
  return vantanUserInputSchema.safeParse(profile.memberType === 'alumni' ? { ...profile, grade: null } : profile).success;
}

export function translateVantanProfile(raw: unknown): VantanUserProfile {
  if (!raw || typeof raw !== 'object') {
    return { name: '', roleTitle: '', departmentName: '', memberType: null, nickname: '', grade: null, company: '' };
  }
  const row = raw as Record<string, unknown>;
  return {
    name: typeof row.name === 'string' ? row.name : '',
    roleTitle: typeof row.role_title === 'string' ? row.role_title : '',
    departmentName: typeof row.department_name === 'string' ? row.department_name : '',
    memberType: row.member_type === 'student' || row.member_type === 'alumni' ? row.member_type : null,
    nickname: typeof row.nickname === 'string' ? row.nickname : '',
    grade: typeof row.grade === 'number' ? row.grade : null,
    company: typeof row.company === 'string' ? row.company : '',
  };
}
