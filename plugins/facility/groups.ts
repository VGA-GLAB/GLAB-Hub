import WebSocket from 'ws';
import type { SqlDb } from '../data.ts';
import { listProjectsWithMembers } from '../data.ts';

export interface BookingGroup { kind: 'organization' | 'team'; id: string; name: string }

/** Read memberships using the current user's Cernere credential, never a supplied user ID. */
export function readOrganizations(baseUrl: string, token: string, userId: string): Promise<BookingGroup[]> {
  const url = new URL(baseUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid Cernere backend URL');
  }
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/auth'; url.search = ''; url.hash = '';
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, ['bearer', token], { handshakeTimeout: 5000, maxPayload: 256 * 1024 });
    let settled = false;
    const finish = (error: boolean, groups: BookingGroup[] = []): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // terminate also covers an incomplete handshake; retain the error handler during cleanup.
      ws.terminate();
      if (error) reject(new Error('Organization memberships unavailable'));
      else resolve(groups);
    };
    const timer = setTimeout(() => finish(true), 8000);
    ws.on('error', () => finish(true));
    ws.on('close', () => finish(true));
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message.type === 'connected') {
          const state = message.user_state as { userId?: string } | undefined;
          if (state?.userId !== userId) return finish(true);
          ws.send(JSON.stringify({ type: 'module_request', module: 'organization', action: 'list', payload: {} }));
        } else if (message.type === 'module_response' && message.module === 'organization' && message.action === 'list') {
          if (!Array.isArray(message.payload)) return finish(true);
          const groups: BookingGroup[] = [];
          for (const item of message.payload) {
            if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') return finish(true);
            groups.push({ kind: 'organization', id: item.id, name: item.name });
          }
          finish(false, groups);
        } else if (message.type === 'error' || message.type === 'guest_connected') finish(true);
        else if (message.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: message.ts }));
      } catch { finish(true); }
    });
  });
}

export function readTeams(db: SqlDb, userId: string): BookingGroup[] {
  return listProjectsWithMembers(db, { status: 'active' })
    .filter(project => project.members.some(member => member.user_id === userId))
    .map(project => ({ kind: 'team', id: project.id, name: project.name }));
}
