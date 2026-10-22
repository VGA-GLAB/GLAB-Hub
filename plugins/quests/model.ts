export type QuestStatus = 'draft' | 'pending' | 'published' | 'withdrawn';
export type QuestCategory = 'team' | 'urgent' | 'personal';
export interface QuestInput {
  title: string; description: string; contact: string;
  projectId: string | null; category: QuestCategory;
}
export interface QuestRow {
  id: string; owner_id: string; title: string; description: string; contact: string;
  project_id: string | null; category: QuestCategory; status: QuestStatus; revision: number;
  approved_by: string | null; approved_role: string | null; approved_at: number | null;
  created_at: number; updated_at: number;
}
export const QUEST_TEMPLATES: Array<QuestInput & { id: string; label: string }> = [
  { id: 'team', label: '企画のチームメンバー募集', category: 'team', title: '一緒にゲームを作る仲間、募集！', description: '【企画】\n作りたい作品の紹介\n\n【募集】\n担当してほしい役割・人数\n\n【活動】\n期間・頻度・場所\n\n【条件】\n経験・報酬・クレジットなど', contact: '', projectId: null },
  { id: 'motion', label: '[急募] モーション制作', category: 'urgent', title: '[急募] キャラクターのモーションが必要！', description: '【依頼】\n必要な動き・本数・使用ツール\n\n【期限】\n希望する納期\n\n【条件】\n報酬・素材の利用範囲・クレジット\n\n【相談】\nまずは制作可能な範囲を教えてください。', contact: '', projectId: null },
  { id: 'personal', label: '個人制作のお手伝い', category: 'personal', title: '個人制作を手伝ってくれる方へ', description: '【作品】\n制作中の作品について\n\n【お願い】\n手伝ってほしいこと\n\n【条件】\n期間・報酬・クレジット\n\n【連絡】\n興味があれば依頼者へ直接ご連絡ください。', contact: '', projectId: null },
];
