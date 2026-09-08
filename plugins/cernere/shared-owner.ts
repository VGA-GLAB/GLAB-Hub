import { CernereProjectClient, type CernereProjectClientConfig } from './project-client.ts';

export type CernereProjectApi = Pick<CernereProjectClient, 'getUserData' | 'setUserData' | 'call'>;
export type SharedClientConfig = CernereProjectClientConfig & { projectKey: string };
interface Entry {
  client: CernereProjectClient;
  secret: string;
  api: CernereProjectApi;
  rotating: boolean;
  revoked: boolean;
  candidate?: CernereProjectClient;
}

/** process 内の共有 client だけを所有し、plugin には close 権限を渡さない。 */
export class CernereClientOwner {
  private readonly entries = new Map<string, Entry>();
  private readonly candidates = new Set<CernereProjectClient>();
  private closed = false;

  get(config: SharedClientConfig): CernereProjectApi {
    if (this.closed) throw new Error('Cernere client owner closed');
    const key = clientKey(config);
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.secret !== config.clientSecret) throw new Error('Explicit credential rotation required');
      return existing.api;
    }
    const client = new CernereProjectClient(config);
    // 失効・終了後は client 内部の closed 判定に依存せず、facade 側で即座に断る。
    const live = (): CernereProjectClient => {
      if (entry.revoked) throw new Error('Cernere project client closed');
      return entry.client;
    };
    const entry: Entry = { client, secret: config.clientSecret, rotating: false, revoked: false, api: {
      getUserData: async (...args) => live().getUserData(...args),
      setUserData: async (...args) => live().setUserData(...args),
      call: async (...args) => live().call(...args),
    } };
    this.entries.set(key, entry);
    return entry.api;
  }

  async rotate(config: SharedClientConfig): Promise<void> {
    if (this.closed) throw new Error('Cernere client owner closed');
    const entry = this.entries.get(clientKey(config));
    if (!entry) throw new Error('No client to rotate');
    if (entry.rotating) throw new Error('Credential rotation already running');
    const candidate = new CernereProjectClient(config);
    entry.rotating = true;
    entry.candidate = candidate;
    this.candidates.add(candidate);
    let activated = false;
    try {
      await candidate.ready();
      if (this.closed || this.entries.get(clientKey(config)) !== entry) throw new Error('Client revoked during rotation');
      const previous = entry.client;
      entry.client = candidate;
      entry.secret = config.clientSecret;
      activated = true;
      previous.close();
    } catch (error) {
      if (!activated) candidate.close();
      throw error;
    } finally {
      this.candidates.delete(candidate);
      entry.rotating = false;
      entry.candidate = undefined;
    }
  }

  /** 漏洩失効では新接続を待たず、既存 facade からの request も直ちに止める。 */
  revoke(config: SharedClientConfig): void {
    const key = clientKey(config);
    const entry = this.entries.get(key);
    this.entries.delete(key);
    if (!entry) return;
    entry.revoked = true;
    try { entry.client.close(); } finally { entry.candidate?.close(); }
  }

  closeAll(): void {
    if (this.closed) return;
    this.closed = true;
    const failures: unknown[] = [];
    for (const entry of this.entries.values()) entry.revoked = true;
    for (const client of [...this.candidates, ...[...this.entries.values()].map((entry) => entry.client)]) {
      try { client.close(); } catch (error) { failures.push(error); }
    }
    this.candidates.clear();
    this.entries.clear();
    if (failures.length) throw new AggregateError(failures, 'Cernere client cleanup failed');
  }
}

function clientKey(config: SharedClientConfig): string {
  const url = new URL(config.cernereBaseUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || !config.projectKey.trim()) throw new Error('Invalid Cernere client identity');
  return JSON.stringify([url.href.replace(/\/+$/, ''), config.clientId, config.projectKey]);
}

export const cernereClientOwner = new CernereClientOwner();
