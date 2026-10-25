export type CallInput =
  | { kind: 'audio_chunk'; pcm: number[]; seq: number }
  | { kind: 'start_interview' | 'barge_in' | 'end_session' };

/** Strip unknown fields by rejecting them; never forward arbitrary browser JSON. */
export function parseCallInput(value: unknown, nextSeq: number): CallInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const frame = value as Record<string, unknown>;
  if (frame.kind === 'audio_chunk') {
    if (Object.keys(frame).length !== 3 || !Array.isArray(frame.pcm)
      || frame.pcm.length === 0 || frame.pcm.length > 8000 || frame.pcm.length % 2 !== 0
      || !frame.pcm.every((byte: unknown) => typeof byte === 'number' && Number.isInteger(byte) && byte >= 0 && byte <= 255)
      || frame.seq !== nextSeq) return null;
    return { kind: 'audio_chunk', pcm: frame.pcm as number[], seq: nextSeq };
  }
  if (Object.keys(frame).length !== 1) return null;
  if (frame.kind === 'start_interview' || frame.kind === 'barge_in' || frame.kind === 'end_session') {
    return { kind: frame.kind };
  }
  return null;
}
