import type { CernereProjectClient } from '../cernere/project-client.ts';

export interface AvailableMember { userId: string; displayName: string; discordId: string | null; }
export interface PresenceIdentity { userId: string; displayName: string; }

const MODULE = 'glab_presence';

export async function listAvailable(client: CernereProjectClient): Promise<AvailableMember[]> {
  const raw = await client.call(MODULE, 'list_available', {});
  if (!Array.isArray(raw)) throw new Error('invalid glab_presence.list_available response');
  return raw.map(readAvailableMember);
}

export async function resolveDiscordId(client: CernereProjectClient, discordId: string): Promise<PresenceIdentity | null> {
  const raw = await client.call(MODULE, 'resolve_by_discord_id', { discordId });
  if (raw === null) return null;
  return readIdentity(raw);
}

export async function setAvailability(client: CernereProjectClient, userId: string, availableNow: boolean, availableUntil: string | null): Promise<void> {
  await client.call(MODULE, 'set_availability', { userId, availableNow, availableUntil });
}

function readAvailableMember(value: unknown): AvailableMember {
  const obj = record(value, 'available member');
  return { userId: text(obj.userId, 'userId'), displayName: text(obj.displayName, 'displayName'), discordId: nullableText(obj.discordId, 'discordId') };
}

function readIdentity(value: unknown): PresenceIdentity {
  const obj = record(value, 'presence identity');
  return { userId: text(obj.userId, 'userId'), displayName: text(obj.displayName, 'displayName') };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid ${label} response`);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`invalid ${field}`);
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return text(value, field);
}
