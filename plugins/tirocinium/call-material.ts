/**
 * Optional ES / portfolio sent with a call start. Tirocinium reads it on the HQ PC with the Consult
 * interviewer skills (Tr spec/feature/voice/glab-material-interview.md). GLab never stores it: the
 * bytes pass through this request only. The cap keeps AWS egress small (neco 2026-10-26).
 */
export type CallMaterial = { kind: 'es' | 'portfolio'; mime: string; data_base64: string };

export const MAX_MATERIAL_BYTES = 5 * 1024 * 1024;
/** JSON body cap for POST /calls (base64 of the material plus a little framing). */
export const MAX_START_BODY_BYTES = Math.ceil((MAX_MATERIAL_BYTES * 4) / 3) + 1024;
export const MATERIAL_MIME = ['application/pdf', 'text/plain', 'text/markdown', 'image/png', 'image/jpeg'] as const;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export type CallStart = { material: CallMaterial | null };

/** `{}` or `{ material: { kind, mime, data_base64 } }`. Unknown fields are rejected, never forwarded. */
export function parseCallStart(value: unknown): CallStart | null {
  if (value === null || value === undefined) return { material: null };
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0) return { material: null };
  if (keys.length !== 1 || keys[0] !== 'material') return null;
  const raw = body.material;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (Object.keys(m).length !== 3) return null;
  if (m.kind !== 'es' && m.kind !== 'portfolio') return null;
  if (typeof m.mime !== 'string' || !(MATERIAL_MIME as readonly string[]).includes(m.mime)) return null;
  if (typeof m.data_base64 !== 'string' || !m.data_base64 || !BASE64.test(m.data_base64)) return null;
  if (Math.floor((m.data_base64.length * 3) / 4) > MAX_MATERIAL_BYTES + 2) return null;
  return { material: { kind: m.kind, mime: m.mime, data_base64: m.data_base64 } };
}

/** Browser side: the type to send for a picked file (some browsers leave .md / .txt empty). */
export function materialMime(file: { name: string; type: string }): string | null {
  const type = file.type.toLowerCase();
  if ((MATERIAL_MIME as readonly string[]).includes(type)) return type;
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return null;
}
