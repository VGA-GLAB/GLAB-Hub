import WebSocket from 'ws';
import type { SqlDb } from '../data.ts';
import { listProjectsWithMembers } from '../data.ts';

/**
 * `representative` marks the organizations whose Cr role for the caller is `owner` (組織の代表者). Aedilis uses it to
 * let that person register the organization's Meet representative account (neco 2026-10-15).
 */
export interface BookingGroup { kind: 'organization' | 'team'; id: string; name: string; representative?: true }

/** Organizations checked for the caller's role; more than this is left unmarked rather than slowing every request. */
const MAX_ROLE_LOOKUPS = 20;
const REPRESENTATIVE_ROLE = 'owner';

/**
 * Read memberships using the current user's Cernere credential, never a supplied user ID.
 * With `withRepresentative`, also reads the caller's own role in each organization (member list, one at a time).
 */
export function readOrganizations(baseUrl: string, token: string, userId: string, options: { withRepresentative?: boolean } = {}): Promise<BookingGroup[]> {
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
    const groups: BookingGroup[] = [];
    let roleIndex = 0;
    // Member lists carry no organization id, so they are requested one at a time and matched by order.
    const nextRole = (): void => {
      if (!options.withRepresentative || roleIndex >= Math.min(groups.length, MAX_ROLE_LOOKUPS)) return finish(false, groups);
      ws.send(JSON.stringify({ type: 'module_request', module: 'member', action: 'list', payload: { organizationId: groups[roleIndex]!.id } }));
    };
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
          for (const item of message.payload) {
            if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') return finish(true);
            groups.push({ kind: 'organization', id: item.id, name: item.name });
          }
          nextRole();
        } else if (message.type === 'module_response' && message.module === 'member' && message.action === 'list') {
          if (!Array.isArray(message.payload)) return finish(true);
          // Only the caller's own role is read; other members' fields are dropped here.
          const self = message.payload.find((member: unknown) => (member as { userId?: unknown } | null)?.userId === userId) as { role?: unknown } | undefined;
          if (self?.role === REPRESENTATIVE_ROLE) groups[roleIndex]!.representative = true;
          roleIndex += 1;
          nextRole();
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
