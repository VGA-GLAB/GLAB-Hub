// Share links for Aedilis meetings answered outside GLab (including login-free guests).

export interface MeetingShareTarget { id: string; visibility: 'public' | 'internal' | 'private'; guestResponses?: boolean }

/** Only URL-readable meetings get a share link; others are answered inside GLab by members. */
export function meetingShareUrl(publicUrl: string | undefined, meeting: MeetingShareTarget): string | null {
  if (!publicUrl || meeting.visibility !== 'public') return null;
  let origin: URL;
  try { origin = new URL(publicUrl); } catch { return null; }
  if (origin.protocol !== 'https:' && origin.protocol !== 'http:') return null;
  return new URL(`/meeting/${encodeURIComponent(meeting.id)}`, origin.origin).href;
}

export function guestResponseLabel(meeting: MeetingShareTarget): string {
  return meeting.visibility === 'public' && meeting.guestResponses ? 'ログインなしで回答可' : '回答はログインが必要';
}
