import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  CernereProjectClient,
  type WsLike,
} from '../plugins/cernere/project-client.ts';
import {
  getVantanUserProfile,
  setVantanUserProfile,
} from '../plugins/vantan-user/profile-client.ts';
import {
  translateVantanProfile,
  vantanUserInputSchema,
} from '../plugins/vantan-user/profile-schema.ts';

class FakeWebSocket implements WsLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  readyState = 0;
  readonly sent: string[] = [];

  constructor(readonly url: string, readonly protocols: string[]) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }

  connect(): void {
    this.readyState = 1;
    this.onmessage?.({ data: JSON.stringify({ type: 'connected' }) });
  }

  respond(payload: unknown): void {
    const request = JSON.parse(this.sent.at(-1) ?? '{}') as { request_id?: string };
    this.onmessage?.({
      data: JSON.stringify({
        type: 'module_response',
        request_id: request.request_id,
        payload,
      }),
    });
  }
}

function projectLoginFetch(): typeof fetch {
  return (async () => new Response(JSON.stringify({ accessToken: 'project-token' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('condition was not reached');
}

describe('CernereProjectClient', () => {
  let client: CernereProjectClient | null = null;

  afterEach(() => {
    client?.close();
    client = null;
  });

  it('reads the shared vantan_user profile through project_credentials WS', async () => {
    const sockets: FakeWebSocket[] = [];
    client = new CernereProjectClient({
      cernereBaseUrl: 'https://cernere.example.com/',
      clientId: 'glab-client',
      clientSecret: 'secret',
      fetchImpl: projectLoginFetch(),
      createWebSocket: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    const resultPromise = getVantanUserProfile(client, 'user-1');
    await waitFor(() => sockets.length === 1);
    const socket = sockets[0]!;
    assert.equal(socket.url, 'wss://cernere.example.com/ws/project');
    assert.deepEqual(socket.protocols, ['bearer', 'project-token']);
    socket.connect();
    await waitFor(() => socket.sent.length === 1);

    const request = JSON.parse(socket.sent[0]!) as Record<string, unknown>;
    assert.deepEqual(request.payload, {
      userId: 'user-1',
      targetProjectKey: 'vantan_user',
      columns: ['name', 'role_title', 'department_name'],
    });
    socket.respond({ name: 'Neco', role_title: '顧問', department_name: 'ゲーム学科' });

    assert.deepEqual(await resultPromise, {
      name: 'Neco',
      roleTitle: '顧問',
      departmentName: 'ゲーム学科',
    });
  });

  it('writes only the three registration fields to vantan_user', async () => {
    const sockets: FakeWebSocket[] = [];
    client = new CernereProjectClient({
      cernereBaseUrl: 'http://127.0.0.1:8080',
      clientId: 'glab-client',
      clientSecret: 'secret',
      fetchImpl: projectLoginFetch(),
      createWebSocket: (url, protocols) => {
        const socket = new FakeWebSocket(url, protocols);
        sockets.push(socket);
        return socket;
      },
    });

    const writePromise = setVantanUserProfile(client, 'user-2', {
      name: '山田 花子',
      roleTitle: '学生',
      departmentName: 'CG学科',
    });
    await waitFor(() => sockets.length === 1);
    const socket = sockets[0]!;
    socket.connect();
    await waitFor(() => socket.sent.length === 1);
    const request = JSON.parse(socket.sent[0]!) as Record<string, unknown>;
    assert.equal(request.action, 'set_user_data');
    assert.deepEqual(request.payload, {
      userId: 'user-2',
      targetProjectKey: 'vantan_user',
      data: {
        name: '山田 花子',
        role_title: '学生',
        department_name: 'CG学科',
      },
    });
    socket.respond({ ok: true, updated: ['name', 'role_title', 'department_name'] });
    await writePromise;
  });

});

describe('vantan_user profile validation', () => {
  it('requires name, role title, and department', () => {
    assert.equal(vantanUserInputSchema.safeParse({
      name: 'Neco',
      roleTitle: '',
      departmentName: 'ゲーム学科',
    }).success, false);
  });

  it('normalizes missing Cernere values to empty strings', () => {
    assert.deepEqual(translateVantanProfile({ name: null }), {
      name: '',
      roleTitle: '',
      departmentName: '',
    });
  });

});
