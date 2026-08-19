/** Request / Response の本文をメモリへ取り込む際の共通上限。 */
export class BodyTooLargeError extends Error {}

interface BodySource {
  body: ReadableStream<Uint8Array> | null;
  headers: Headers;
}

/** Content-Length の有無に依存せず、指定バイト数までしか本文を保持しない。 */
export async function readBodyWithinLimit(source: BodySource, maxBytes: number): Promise<ArrayBuffer> {
  const declaredLength = Number(source.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await discardBody(source);
    throw new BodyTooLargeError();
  }
  if (!source.body) return new ArrayBuffer(0);

  const reader = source.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // 上限超過が本来の失敗。既に閉じた stream の cancel 失敗は上書きしない。
        }
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = new ArrayBuffer(total);
  const body = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

/** 読み取らない本文を破棄し、fetch接続を再利用・解放できる状態にする。 */
export async function discardBody(source: Pick<BodySource, 'body'>): Promise<void> {
  try {
    await source.body?.cancel();
  } catch {
    // 応答 stream が既に閉じている場合の best-effort cleanup。
  }
}
