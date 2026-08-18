import type { CernereProjectClient } from '../cernere/project-client.ts';
import { declarePresenceSchema } from './presence-schema.ts';

export interface AvailableMember { userId: string; displayName: string; discordId: string | null; }
interface PresenceIdentity { userId: string; displayName: string; }

// Cernere は「どのサービスか」を知らずに解決する設計なので、presence 専用コマンドは無い。
// おれひまは managed_project の汎用コマンドの上に組み立てる:
//   - 列 available_now / available_until は自分の schema 宣言 (presence-schema.ts) 由来
//   - discord_id は Cernere 側の identity_claims 宣言で開示された identity claim
// 詳細は Cernere spec/feature/identity-claims.md。
const MODULE = 'managed_project';

const AVAILABLE_NOW = 'available_now';
const AVAILABLE_UNTIL = 'available_until';
const DISCORD_ID_CLAIM = 'discord_id';

/** @implements SPEC-CONSULT-PRESENCE-001 */
export async function listAvailable(client: CernereProjectClient): Promise<AvailableMember[]> {
  // available_now が立っていて、かつ期限切れでない行だけを Cernere 側で絞る。
  // available_until が NULL なら無期限 (activeAt の規則)。
  await declarePresenceSchema(client);
  const raw = await client.call(MODULE, 'list_user_data', {
    columns: [AVAILABLE_NOW, AVAILABLE_UNTIL],
    where: { [AVAILABLE_NOW]: true },
    activeAt: { column: AVAILABLE_UNTIL },
    claims: [DISCORD_ID_CLAIM],
  });
  if (!Array.isArray(raw)) throw new Error('invalid managed_project.list_user_data response');
  return raw.map(readAvailableMember);
}

/** @implements SPEC-CONSULT-PRESENCE-002 */
export async function resolveDiscordId(client: CernereProjectClient, discordId: string): Promise<PresenceIdentity | null> {
  await declarePresenceSchema(client);
  const raw = await client.call(MODULE, 'resolve_user_by_claim', { claim: DISCORD_ID_CLAIM, value: discordId });
  if (raw === null) return null;
  return readIdentity(raw);
}

/** @implements SPEC-CONSULT-PRESENCE-003 */
export async function setAvailability(client: CernereProjectClient, userId: string, availableNow: boolean, availableUntil: string | null): Promise<void> {
  await declarePresenceSchema(client);
  await client.call(MODULE, 'set_user_data', {
    userId,
    data: { [AVAILABLE_NOW]: availableNow, [AVAILABLE_UNTIL]: availableUntil },
  });
}

/** @implements SPEC-CONSULT-PRESENCE-001 */
function readAvailableMember(value: unknown): AvailableMember {
  const obj = record(value, 'available member');
  // 汎用コマンドは宣言どおりの列名 (snake_case) で返す。discordId は claim 名 discord_id。
  return { userId: text(obj.userId, 'userId'), displayName: text(obj.displayName, 'displayName'), discordId: nullableText(obj[DISCORD_ID_CLAIM], 'discord_id') };
}

/** @implements SPEC-CONSULT-PRESENCE-002 */
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

/** @implements SPEC-CONSULT-PRESENCE-001 */
function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return text(value, field);
}
