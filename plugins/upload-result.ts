/** Finish a small upload result before releasing the private source body.
 * Large GET/Range responses never enter this path.
 * @implements SPEC-GLAB-BOUND-AUTH-001
 */
export async function readUploadResult(response: Response, signal?: AbortSignal | null): Promise<Response> {
  if (!response.body) return new Response(null, { status: response.status, headers: response.headers });
  const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = [];
  const maximum = 64 * 1024;
  let length = 0, ended = false;
  const cancel = (): void => { void reader.cancel().catch(() => { /* Best-effort abort; the read checks the signal again. */ }); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    signal?.throwIfAborted();
    while (true) {
      const part = await reader.read(); signal?.throwIfAborted();
      if (part.done) { ended = true; break; }
      length += part.value.byteLength;
      if (length > maximum) throw new Error('Upload result exceeded its bound');
      chunks.push(Uint8Array.from(part.value));
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new Response(bytes, { status: response.status, headers: response.headers });
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (!ended) await reader.cancel().catch(() => { /* The response may already be disconnected. */ });
    reader.releaseLock();
  }
}
