import type {
  ConnectorHealth,
  ConnectorScope,
  ServiceConnector,
} from '../corpus/server/hub/sdk.ts';

const HEALTH_TIMEOUT_MS = 5_000;

export interface VersionedConnectorOptions {
  id: string;
  title: string;
  scope: ConnectorScope;
  baseUrl: string;
  healthPath: string;
}

export interface ConnectorProbe {
  health: ConnectorHealth;
  payload: unknown;
}

export class VersionedHttpServiceConnector implements ServiceConnector {
  readonly id: string;
  readonly title: string;
  readonly scope: ConnectorScope;
  readonly baseUrl: string;
  private readonly healthPath: string;

  constructor(options: VersionedConnectorOptions) {
    this.id = options.id;
    this.title = options.title;
    this.scope = options.scope;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.healthPath = options.healthPath;
  }

  async health(): Promise<ConnectorHealth> {
    return (await this.probe()).health;
  }

  async probe(): Promise<ConnectorProbe> {
    if (!this.baseUrl) {
      return { health: { status: 'degraded', detail: '接続先未設定' }, payload: null };
    }
    try {
      const response = await timedFetch(`${this.baseUrl}${this.healthPath}`);
      if (!response.ok) {
        return { health: { status: 'degraded', detail: `health ${response.status}` }, payload: null };
      }
      const body = await response.json().catch(() => null) as unknown;
      const version = healthVersion(body);
      return {
        health: {
          status: healthReportsFailure(body) ? 'degraded' : 'up',
          detail: version ? `v${version}` : 'バージョン情報なし',
        },
        payload: body,
      };
    } catch (error) {
      return {
        health: {
          status: 'down',
          detail: error instanceof Error ? error.message : String(error),
        },
        payload: null,
      };
    }
  }

  async fetch(path: string, init?: RequestInit): Promise<Response> {
    if (!this.baseUrl) {
      return Response.json(
        { error: 'connector_unconfigured', connector: this.id },
        { status: 503 },
      );
    }
    const separator = path.startsWith('/') ? '' : '/';
    // データ通信には health 用の短いタイムアウトを課さない (呼び出し側の signal を尊重)。
    return fetch(`${this.baseUrl}${separator}${path}`, init);
  }
}

export function healthVersion(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (typeof body.version === 'string' && body.version.trim()) return body.version.trim();
  if (body.data && typeof body.data === 'object') {
    const version = (body.data as Record<string, unknown>).version;
    if (typeof version === 'string' && version.trim()) return version.trim();
  }
  return null;
}

function healthReportsFailure(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return body.ok === false || body.status === 'error' || body.status === 'down';
}

/** probe (health check) 専用の短タイムアウト付き fetch。データ通信には使わない。 */
async function timedFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
