// 部員名簿の Discord ユーザー名 → 数値 ID 解決タスク。
//
// 管理者は名簿 (glab_member) に Discord の「名前」(旧 name#1234 / 新ユニークユーザー名)
// で部員を登録する。 数値 user ID は bot が guild member search で解決して書き戻す
// (hub と同じ corpus.db を WAL 共有しているので、 hub 側の名簿表示に即反映される)。
//
// - 起動時 + 周期 (既定 10 分) に discord_user_id 未解決の行を走査
// - 解決は guild members search (REST)。 privileged intent 不要
// - 見つからない行はそのまま残す (handle の typo 等は管理APIで修正する)

import type { Client, Guild } from 'discord.js';
import {
  membersNeedingDiscordResolution,
  setMemberDiscordUserId,
  type MemberRow,
  type SqlDb,
} from '../plugins/data.ts';

const RESOLVE_INTERVAL_MS = 10 * 60 * 1000;

/** "name#1234" を { name, discriminator } に分解する。 新ユニーク名は discriminator 無し。 */
function parseHandle(handle: string): { name: string; discriminator: string | null } {
  const m = /^(.+?)#(\d{1,4})$/.exec(handle.trim());
  if (m) return { name: m[1] ?? '', discriminator: m[2] ?? null };
  return { name: handle.trim().replace(/^@/, ''), discriminator: null };
}

async function resolveOne(guild: Guild, member: MemberRow): Promise<string | null> {
  const { name, discriminator } = parseHandle(member.discord_handle ?? '');
  if (!name) return null;
  const found = await guild.members.search({ query: name, limit: 10 });
  for (const gm of found.values()) {
    const u = gm.user;
    // 表示名・サーバーニックネームは重複可能なので、ログイン名だけを照合する。
    if (u.username.toLowerCase() !== name.toLowerCase()) continue;
    if (discriminator && u.discriminator !== discriminator) continue;
    return u.id;
  }
  return null;
}

export function startMemberResolver(client: Client, db: SqlDb, guildId: string): () => Promise<void> {
  let stopped = false;
  let inFlight: Promise<void> | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const pending = membersNeedingDiscordResolution(db);
    if (pending.length === 0) return;
    let guild: Guild;
    try {
      guild = await client.guilds.fetch(guildId);
    } catch (e) {
      const errorType = e instanceof Error ? e.name : 'UnknownError';
      console.error(`[glab-bot] member-resolver: guild fetch 失敗 (${errorType})`);
      return;
    }
    for (const m of pending) {
      if (stopped) return;
      try {
        const id = await resolveOne(guild, m);
        if (id && !stopped && m.discord_handle) {
          setMemberDiscordUserId(db, m.id, m.discord_handle, id);
        }
      } catch (e) {
        const errorType = e instanceof Error ? e.name : 'UnknownError';
        console.error(`[glab-bot] member-resolver: ユーザー解決失敗 (${errorType})`);
      }
    }
  };

  const runTick = (): void => {
    if (stopped || inFlight) return;
    inFlight = tick()
      .catch((e: unknown) => {
        const errorType = e instanceof Error ? e.name : 'UnknownError';
        console.error(`[glab-bot] member-resolver: 周期処理失敗 (${errorType})`);
      })
      .finally(() => { inFlight = null; });
  };

  runTick();
  const timer = setInterval(runTick, RESOLVE_INTERVAL_MS);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await inFlight;
  };
}
