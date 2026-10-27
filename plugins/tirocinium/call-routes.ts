import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { Hono, getIdentity } from '../../corpus/server/hub/sdk.ts';
import type { Context, CorpusContext, ServiceConnector } from '../../corpus/server/hub/sdk.ts';
import { authorizedConnectorFetch, noStore, normalizeHttpBaseUrl } from '../shared.ts';
import { parseCallInput } from './call-input.ts';
import { MAX_START_BODY_BYTES, parseCallStart } from './call-material.ts';

type Call = {
  userId: string; sessionId: string; ws: WebSocket; timer: ReturnType<typeof setTimeout>;
  pending: string[]; pendingBytes: number; controller: ReadableStreamDefaultController<Uint8Array> | null;
  attached: boolean; nextSeq: number; closed: boolean; dispose: () => void;
  closeStream: (() => void) | null; rateAt: number; rateCount: number;
};
const encoder = new TextEncoder();
const MAX_BUFFER = 4 * 1024 * 1024;
const activeCalls = new Set<() => void>();
/** Tr reads the submitted material with claude on the HQ PC before the call starts. */
const MATERIAL_TIMEOUT_MS = 150_000;

/** Read a request body up to `max` bytes (chunked bodies included). null when larger or unreadable. */
async function readBounded(c: Context, max: number): Promise<string | null> {
  const reader = c.req.raw.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > max) { await reader.cancel(); return null; }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch { return null; } finally { reader.releaseLock(); }
}

export function closeTirociniumCalls(): void {
  for (const dispose of activeCalls) dispose();
}

/** Same-origin voice transport. Corpus stays unchanged; Cernere remains identity authority. */
export function makeCallRoutes(ctx: CorpusContext, connector: ServiceConnector): Hono {
  const routes = new Hono();
  const calls = new Map<string, Call>();
  const starting = new Set<string>();
  const downstream = (c: Context, path: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> =>
    authorizedConnectorFetch(c, connector, path, ctx.tokenProvider, 'tirocinium', {
      ...init, signal: AbortSignal.timeout(timeoutMs),
    });
  const owned = (c: Context): Call | undefined => {
    const call = calls.get(c.req.param('id') ?? '');
    return call?.userId === getIdentity(c).userId && !call.closed ? call : undefined;
  };
  routes.use('*', async (c, next) => { noStore(c); await next(); });

  routes.post('/', async (c) => {
    const userId = getIdentity(c).userId;
    const rawBody = await readBounded(c, MAX_START_BODY_BYTES);
    if (rawBody === null) return c.json({ error: 'material_too_large' }, 413);
    let parsedBody: unknown = null;
    try { parsedBody = rawBody.trim() ? JSON.parse(rawBody) : null; } catch { return c.json({ error: 'invalid_call_start' }, 400); }
    const startRequest = parseCallStart(parsedBody);
    if (!startRequest) return c.json({ error: 'invalid_call_start' }, 400);
    if (starting.has(userId) || [...calls.values()].some((call) => call.userId === userId)) {
      return c.json({ error: 'call_already_active' }, 409);
    }
    if (calls.size + starting.size >= 32) return c.json({ error: 'call_capacity' }, 503);
    starting.add(userId);
    let sessionId: string | null = null;
    let ws: WebSocket | null = null;
    let failure: 'material_rejected' | 'material_unavailable' | null = null;
    try {
      const base = normalizeHttpBaseUrl(connector.baseUrl, 'TIROCINIUM_URL');
      if (!base) return c.json({ error: 'tirocinium_unconfigured' }, 503);
      const created = await downstream(c, '/api/v1/sessions', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      });
      if (!created.ok) return c.json({ error: 'session_unavailable' }, 503);
      const result = await created.json() as { session_id?: unknown; reservation_offer?: unknown };
      if (typeof result.session_id !== 'string' || !/^[0-9a-f-]{36}$/.test(result.session_id)) {
        return c.json({ error: result.reservation_offer ? 'interviewer_busy' : 'invalid_session' }, 503);
      }
      sessionId = result.session_id;
      if (c.req.raw.signal.aborted) throw new Error('request_aborted');
      if (startRequest.material) {
        // Forwarded once, not kept: Tr digests it in memory and deletes the file (glab-material-interview.md).
        const submitted = await downstream(c, `/api/v1/sessions/${sessionId}/materials`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(startRequest.material),
        }, MATERIAL_TIMEOUT_MS);
        if (!submitted.ok) {
          failure = submitted.status === 413 || submitted.status === 415 ? 'material_rejected' : 'material_unavailable';
          throw new Error('material_failed');
        }
        if (c.req.raw.signal.aborted) throw new Error('request_aborted');
      }
      const response = await downstream(c, `/api/v1/sessions/${sessionId}/call-ticket`, { method: 'POST' });
      if (!response.ok) throw new Error('ticket_failed');
      const auth = await response.json() as { ticket?: unknown };
      if (typeof auth.ticket !== 'string') throw new Error('ticket_failed');
      const url = new URL(`/api/v1/ws/call/${sessionId}`, base);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(url, { maxPayload: MAX_BUFFER, handshakeTimeout: 10_000 });
      const socket = ws;
      const id = randomUUID();
      const call: Call = {
        userId, sessionId, ws, timer: setTimeout(() => call.dispose(), 20_000),
        pending: [], pendingBytes: 0, controller: null, attached: false,
        nextSeq: 0, closed: false,
        closeStream: null, rateAt: Date.now(), rateCount: 0,
        dispose: () => {
          if (call.closed) return;
          call.closed = true;
          clearTimeout(call.timer);
          c.req.raw.signal.removeEventListener('abort', call.dispose);
          calls.delete(id);
          activeCalls.delete(call.dispose);
          call.closeStream?.(); call.closeStream = null;
          socket.terminate();
          try { call.controller?.close(); } catch { /* reader may already be cancelled */ }
          call.pending = [];
          call.controller = null;
          void downstream(c, `/api/v1/sessions/${call.sessionId}/end`, { method: 'POST' })
            .then((r) => { if (!r.ok && r.status !== 404) ctx.logger.warn('Tr call end rejected'); })
            .catch(() => ctx.logger.warn('Tr call end unavailable'));
        },
      };
      calls.set(id, call);
      activeCalls.add(call.dispose);
      c.req.raw.signal.addEventListener('abort', call.dispose, { once: true });
      if (c.req.raw.signal.aborted) throw new Error('request_aborted');
      await new Promise<void>((resolve, reject) => {
        let ready = false;
        const setup = setTimeout(() => reject(new Error('call_setup_timeout')), 15_000);
        const finish = (error?: Error): void => {
          clearTimeout(setup);
          if (!ready) { ready = true; error ? reject(error) : resolve(); }
        };
        socket.on('open', () => socket.send(JSON.stringify({ ticket: auth.ticket })));
        socket.on('message', (data, binary) => {
          if (call.closed) return;
          try {
            if (binary) throw new Error('invalid_frame');
            const frame: unknown = JSON.parse(data.toString());
            if (!frame || typeof frame !== 'object') throw new Error('invalid_frame');
            if ((frame as { kind?: unknown }).kind === 'session_ready') finish();
            const event = `data: ${JSON.stringify(frame)}\n\n`;
            if (call.controller) {
              if ((call.controller.desiredSize ?? 0) <= 0) throw new Error('slow_reader');
              call.controller.enqueue(encoder.encode(event));
            } else {
              call.pendingBytes += Buffer.byteLength(event);
              if (call.pendingBytes > MAX_BUFFER || call.pending.length >= 128) throw new Error('slow_reader');
              call.pending.push(event);
            }
          } catch { finish(new Error('call_stream_failed')); call.dispose(); }
        });
        socket.on('close', () => { finish(new Error('call_closed')); call.dispose(); });
        socket.on('error', () => { finish(new Error('call_failed')); call.dispose(); });
      }).catch((error: unknown) => { call.dispose(); throw error; });
      return c.json({ call_id: id });
    } catch {
      ws?.terminate();
      if (sessionId) {
        try { await downstream(c, `/api/v1/sessions/${sessionId}/end`, { method: 'POST' }); }
        catch { ctx.logger.warn('Tr failed call cleanup unavailable'); }
      }
      if (failure === 'material_rejected') return c.json({ error: failure }, 422);
      return c.json({ error: failure ?? 'call_unavailable' }, 503);
    } finally { starting.delete(userId); }
  });

  routes.get('/:id/events', (c) => {
    const call = owned(c);
    if (!call) return c.json({ error: 'not_found' }, 404);
    if (call.attached) return c.json({ error: 'stream_already_attached' }, 409);
    call.attached = true;
    clearTimeout(call.timer);
    // A stalled browser cannot reserve an interview slot indefinitely.
    call.timer = setTimeout(() => call.dispose(), 35 * 60_000);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        call.controller = controller;
        for (const event of call.pending) controller.enqueue(encoder.encode(event));
        call.pending = []; call.pendingBytes = 0;
        c.req.raw.signal.addEventListener('abort', call.dispose, { once: true });
        const heartbeat = setInterval(() => {
          if (call.closed) return;
          if ((controller.desiredSize ?? 0) <= 0) { call.dispose(); return; }
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        }, 15_000);
        call.closeStream = () => {
          clearInterval(heartbeat);
          c.req.raw.signal.removeEventListener('abort', call.dispose);
        };
        if (c.req.raw.signal.aborted) call.dispose();
      },
      cancel: () => call.dispose(),
    }, { highWaterMark: MAX_BUFFER, size: (chunk) => chunk.byteLength });
    return new Response(stream, { headers: {
      'content-type': 'text/event-stream', 'cache-control': 'private, no-store',
      'x-accel-buffering': 'no',
    } });
  });
  routes.post('/:id/frames', async (c) => {
    const call = owned(c);
    if (!call) return c.json({ error: 'not_found' }, 404);
    if (Date.now() - call.rateAt >= 1000) { call.rateAt = Date.now(); call.rateCount = 0; }
    if (++call.rateCount > 40) { call.dispose(); return c.json({ error: 'call_rate_limit' }, 429); }
    // Bound actual bytes, including chunked bodies, before JSON parsing.
    const reader = c.req.raw.body?.getReader();
    if (!reader) return c.json({ error: 'invalid_frame' }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    const bodyTimeout = setTimeout(() => { void reader.cancel().catch(() => ctx.logger.warn('Tr body cancellation failed')); }, 5_000);
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 64 * 1024) { await reader.cancel(); return c.json({ error: 'frame_too_large' }, 413); }
        chunks.push(chunk.value);
      }
      const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const sanitized = parseCallInput(raw, call.nextSeq);
      if (!sanitized) return c.json({ error: 'invalid_frame' }, 400);
      if (sanitized.kind === 'audio_chunk') call.nextSeq++;
      if (call.ws.readyState !== WebSocket.OPEN || call.ws.bufferedAmount > 256 * 1024) {
        call.dispose(); return c.json({ error: 'upstream_busy' }, 503);
      }
      call.ws.send(JSON.stringify(sanitized));
      return c.json({ ok: true });
    } catch { return c.json({ error: 'invalid_frame' }, 400); }
    finally { clearTimeout(bodyTimeout); reader.releaseLock(); }
  });
  routes.delete('/:id', (c) => {
    const call = owned(c);
    if (!call) return c.json({ error: 'not_found' }, 404);
    call.dispose(); return c.json({ ok: true });
  });
  return routes;
}
