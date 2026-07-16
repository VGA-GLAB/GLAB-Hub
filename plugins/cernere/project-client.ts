import WebSocket from 'ws';

const REQUEST_TIMEOUT_MS = 10_000;
const WS_OPEN = 1;
const PROJECT_KEY_PATTERN = /^[a-z][a-z0-9_]{1,62}$/;
const COLUMN_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

export interface WsLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code: number; reason: string }) => void) | null;
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface CernereProjectClientConfig {
  cernereBaseUrl: string;
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
  createWebSocket?: (url: string, protocols: string[]) => WsLike;
  requestTimeoutMs?: number;
  now?: () => number;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function defaultCreateWebSocket(url: string, protocols: string[]): WsLike {
  return new WebSocket(url, protocols) as unknown as WsLike;
}

function toProjectWsUrl(cernereBaseUrl: string): string {
  return cernereBaseUrl.replace(/\/+$/, '').replace(/^http/i, 'ws') + '/ws/project';
}

export class CernereProjectClient {
  private readonly cernereBaseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly createWebSocket: (url: string, protocols: string[]) => WsLike;
  private readonly requestTimeoutMs: number;
  private readonly now: () => number;

  private ws: WsLike | null = null;
  private connectPromise: Promise<void> | null = null;
  private requestSequence = 0;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(config: CernereProjectClientConfig) {
    if (!config.cernereBaseUrl.trim()) throw new Error('cernereBaseUrl is required');
    if (!config.clientId.trim()) throw new Error('clientId is required');
    if (!config.clientSecret.trim()) throw new Error('clientSecret is required');
    this.cernereBaseUrl = config.cernereBaseUrl.replace(/\/+$/, '');
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.createWebSocket = config.createWebSocket ?? defaultCreateWebSocket;
    this.requestTimeoutMs = config.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.now = config.now ?? Date.now;
  }

  async getUserData(
    userId: string,
    targetProjectKey: string,
    columns: string[],
  ): Promise<unknown> {
    return this.request('managed_project', 'get_user_data', {
      userId: requireUserId(userId),
      targetProjectKey: requireProjectKey(targetProjectKey),
      columns: requireColumns(columns),
    });
  }

  async setUserData(
    userId: string,
    targetProjectKey: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const columns = requireColumns(Object.keys(data));
    if (columns.length === 0) throw new Error('data must contain at least one column');
    await this.request('managed_project', 'set_user_data', {
      userId: requireUserId(userId),
      targetProjectKey: requireProjectKey(targetProjectKey),
      data,
    });
  }

  close(): void {
    this.rejectPending(new Error('Cernere project client closed'));
    this.ws?.close();
    this.ws = null;
    this.connectPromise = null;
  }

  private async request(
    module: string,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<unknown> {
    await this.ensureConnected();
    if (!this.ws || this.ws.readyState !== WS_OPEN) {
      throw new Error('Cernere project WebSocket is not connected');
    }

    const requestId = `glab-${this.now()}-${this.requestSequence++}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Cernere request timed out: ${module}.${action}`));
      }, this.requestTimeoutMs);
      timer.unref?.();
      this.pending.set(requestId, { resolve, reject, timer });

      try {
        this.ws?.send(JSON.stringify({
          type: 'module_request',
          request_id: requestId,
          module,
          action,
          payload,
        }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.ws?.readyState === WS_OPEN) return;
    if (!this.connectPromise) {
      this.connectPromise = this.connect().finally(() => {
        this.connectPromise = null;
      });
    }
    await this.connectPromise;
  }

  private async connect(): Promise<void> {
    const token = await this.fetchProjectToken();
    await new Promise<void>((resolve, reject) => {
      const ws = this.createWebSocket(toProjectWsUrl(this.cernereBaseUrl), ['bearer', token]);
      let settled = false;
      const handshakeTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.ws = null;
        ws.close();
        reject(new Error('Cernere project WebSocket authentication timed out'));
      }, this.requestTimeoutMs);
      handshakeTimer.unref?.();
      this.ws = ws;

      ws.onmessage = (event) => {
        const message = parseMessage(event.data);
        if (!message) return;
        if (message.type === 'connected' && !settled) {
          settled = true;
          clearTimeout(handshakeTimer);
          resolve();
          return;
        }
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: message.ts }));
          return;
        }
        this.handleResponse(message);
      };
      ws.onerror = (event) => {
        if (settled) return;
        settled = true;
        clearTimeout(handshakeTimer);
        this.ws = null;
        reject(new Error(`Cernere project WebSocket error: ${describeError(event)}`));
      };
      ws.onclose = (event) => {
        this.ws = null;
        this.rejectPending(new Error(`Cernere project WebSocket closed (${event.code})`));
        if (!settled) {
          settled = true;
          clearTimeout(handshakeTimer);
          reject(new Error(`Cernere project WebSocket closed before authentication (${event.code})`));
        }
      };
    });
  }

  private async fetchProjectToken(): Promise<string> {
    const response = await this.fetchImpl(`${this.cernereBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'project_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
    if (!response.ok) {
      throw new Error(`Cernere project login failed: HTTP ${response.status}`);
    }
    const body = await response.json() as { accessToken?: unknown };
    if (typeof body.accessToken !== 'string' || !body.accessToken) {
      throw new Error('Cernere project login response is missing accessToken');
    }
    return body.accessToken;
  }

  private handleResponse(message: Record<string, unknown>): void {
    const requestId = typeof message.request_id === 'string' ? message.request_id : null;
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);

    if (message.type === 'module_response') {
      pending.resolve(message.payload ?? {});
      return;
    }
    if (message.type === 'error') {
      pending.reject(new Error(
        typeof message.message === 'string' ? message.message : 'Cernere module request failed',
      ));
    }
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function requireUserId(userId: string): string {
  const normalized = userId.trim();
  if (!normalized) throw new Error('userId is required');
  return normalized;
}

function requireProjectKey(projectKey: string): string {
  const normalized = projectKey.trim();
  if (!PROJECT_KEY_PATTERN.test(normalized)) throw new Error('targetProjectKey is invalid');
  return normalized;
}

function requireColumns(columns: string[]): string[] {
  if (!columns.every((column) => COLUMN_PATTERN.test(column))) {
    throw new Error('columns contain an invalid name');
  }
  return [...columns];
}

function parseMessage(raw: unknown): Record<string, unknown> | null {
  try {
    return JSON.parse(String(raw)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return 'unknown error';
}
