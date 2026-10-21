export interface Admission {
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: number;
  decided_by: string | null;
  decided_at: number | null;
  revision: number;
}
