// odeum-relay の WebSocket メッセージ (視聴者側で扱う分)。
// 正本は spec/plan/2026-10-04-odeum-live-presentation-design.md「WebSocket メッセージ」。

export const STAMP_KINDS = ['clap', 'laugh', 'wow', 'question', 'agree'] as const;
export type StampKind = typeof STAMP_KINDS[number];

export const MAX_COMMENT_LENGTH = 280;
export const MAX_TELOP_LENGTH = 60;
export type SubmissionCategory = 'question' | 'impression';
export interface PublicText {
  text: string;
  from: { sub: string; name: string };
  at: number;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type ServerMessage =
  | { type: 'welcome'; sid: string; role: string; self: { sub: string; name: string }; ice_servers?: IceServerConfig[] }
  | { type: 'sdp'; sdp: { type: 'offer' | 'answer'; sdp: string } }
  | { type: 'candidate'; candidate: string; mid?: string | null }
  | { type: 'poll.open'; poll_id: string; question: string; choices: string[]; multi: boolean }
  | { type: 'poll.closed'; poll_id: string; tally?: number[] }
  | { type: 'tally'; poll_id: string; counts: number[]; answered: number }
  | { type: 'reaction.burst'; good: number; stamps?: Partial<Record<StampKind, number>> }
  | ({ type: 'telop' } & PublicText)
  | ({ type: 'submission'; category: SubmissionCategory; show_on_screen: true } & PublicText)
  | { type: 'presence'; presenter_connected: boolean; viewer_count: number; reaction_version?: number }
  | { type: 'error'; code: string; message?: string };

export type ClientMessage =
  | { type: 'sdp'; sdp: { type: 'offer' | 'answer'; sdp: string } }
  | { type: 'candidate'; candidate: string; mid: string | null }
  | { type: 'good'; count: number }
  | { type: 'stamp'; kind: StampKind }
  | { type: 'comment'; text: string }
  | { type: 'telop'; text: string }
  | { type: 'submission'; text: string; category: SubmissionCategory; show_on_screen: boolean }
  | { type: 'poll.answer'; poll_id: string; choices: number[] };

const KNOWN_TYPES = new Set([
  'welcome', 'sdp', 'candidate', 'poll.open', 'poll.closed', 'tally',
  'reaction.burst', 'presence', 'error', 'telop', 'submission',
]);

/** 受信文字列を解釈する。 壊れたものや視聴者が扱わない type は null。 */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  if (typeof raw !== 'string') return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const type = (value as { type?: unknown }).type;
  if (type === 'telop' || type === 'submission') {
    const post = value as Record<string, unknown>;
    if (typeof post.text !== 'string' || !validateReactionText(post.text, type === 'telop' ? MAX_TELOP_LENGTH : MAX_COMMENT_LENGTH)) return null;
    if (!post.from || typeof post.from !== 'object') return null;
    const from = post.from as Record<string, unknown>;
    if (typeof from.sub !== 'string' || !from.sub || from.sub.length > 512 || typeof from.name !== 'string' || Array.from(from.name).length > 64) return null;
    if (typeof post.at !== 'number' || !Number.isSafeInteger(post.at) || post.at < 0) return null;
    // Defense in depth: private text is never handed to a viewer renderer.
    if (type === 'submission' && (post.show_on_screen !== true || (post.category !== 'question' && post.category !== 'impression'))) return null;
  }
  return typeof type === 'string' && KNOWN_TYPES.has(type) ? value as ServerMessage : null;
}

/** No truncation: preserve a rejected draft so the sender can shorten it. */
export function validateReactionText(text: string, maximum: number): string | null {
  const trimmed = text.trim();
  if (!trimmed || Array.from(trimmed).length > maximum) return null;
  // Reject lone surrogates rather than relying on replacement during UTF-8 encoding.
  for (const char of trimmed) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp >= 0xd800 && cp <= 0xdfff) return null;
  }
  return trimmed;
}

/** コメント本文を送れる形に整える。 空なら null。 */
export function normalizeComment(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const chars = Array.from(trimmed);
  return chars.length > MAX_COMMENT_LENGTH ? chars.slice(0, MAX_COMMENT_LENGTH).join('') : trimmed;
}
