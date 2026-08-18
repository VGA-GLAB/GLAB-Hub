// 感想リレーの組み立て — Volputas への投稿 (POST /reviews の proxy) が 201 で返した
// record から、bot が Discord に流す glab_review_relay の行を作る。
//
// 以前は Volputas が GLAB の /external/review-relay へ折り返していたが、感想の
// 入口は GLAB の proxy だけなので (Volputas 側の producer は integrations/glab/reviews
// のみ)、GLAB が応答を見て自分でキューする。これで Volputas → GLAB の service token と
// 折り返し経路が要らなくなる (spec/interface/review-relay.md)。
//
// このファイルは純粋関数のみ。DB 書き込み (queueReviewRelay) は index.ts が行う。

import { z } from 'zod';
import type { NewReviewRelay } from '../data.ts';

/** Discord カードに載せる可変長本文の上限 (bot/format.ts の切り詰めより手前で有界にする)。 */
export const MAX_EXCERPT_LENGTH = 300;
export const MAX_TITLE_LENGTH = 120;
export const MAX_AUTHOR_LENGTH = 80;
/** 匿名投稿の表示名 (Volputas 折り返し時代と同じ語)。 */
export const ANONYMOUS_AUTHOR = '匿名';
const FALLBACK_AUTHOR = 'Player';

/**
 * Volputas `POST /api/v1/integrations/glab/reviews` の 201 応答。
 * `{ ok: true, data: { record } }` の record のうちリレーに要る列だけを見る
 * (他の列は無視 = passthrough で増えても壊れない)。
 */
const createdReviewResponseSchema = z.object({
  data: z.object({
    record: z.object({
      id: z.string().min(1).max(200),
      gameTitle: z.string().min(1),
      recommend: z.boolean().nullable().optional(),
      comment: z.string().optional(),
      glabProjectId: z.string().min(1).nullable().optional(),
      visibility: z.string().optional(),
      anonymous: z.boolean().optional(),
    }).passthrough(),
  }).passthrough(),
}).passthrough();

export type CreatedReviewRecord = z.infer<typeof createdReviewResponseSchema>['data']['record'];

/** `@everyone` / `@here` / ロール・ユーザ mention を無害化する (bot 側 allowedMentions と二重防御)。 */
export function sanitizeMentions(text: unknown): string {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/@(everyone|here)\b/gi, '@\u200b$1')
    .replace(/<@&?[^>]+>/g, (mention) => mention.replace('@', '@\u200b'));
}

function outboundText(value: unknown, maxLength: number): string {
  const text = sanitizeMentions(value);
  if (text.length <= maxLength) return text;
  // Discord に渡す前の切り詰めでも、UTF-16 の途中 (絵文字のサロゲートペア間) で
  // 切ると不正な文字列をキューへ保存してしまう。bot 側の truncate と同じ境界を守る。
  const end = /[\uD800-\uDBFF]/.test(text[maxLength - 1] ?? '') ? maxLength - 1 : maxLength;
  return text.slice(0, end);
}

/** Volputas の 201 応答本文から record を取り出す。形が違えば null (無言で通さず呼び出し側が warn する)。 */
export function parseCreatedReview(body: unknown): CreatedReviewRecord | null {
  const parsed = createdReviewResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.data.record : null;
}

/**
 * リレー先 URL。GLAB がフロントなので GLAB 自身 (CORPUS_PUBLIC_URL) へ戻す。
 * project 付きなら `?projectId=` を付ける (volputas パネルがこのクエリで感想タブを開く)。
 */
export function reviewUrl(publicUrl: string | null | undefined, projectId: string | null): string | null {
  if (!publicUrl) return null;
  let base: URL;
  try {
    base = new URL(publicUrl);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(base.protocol)) return null;
  const url = new URL('/', base);
  if (projectId) url.searchParams.set('projectId', projectId);
  return url.toString();
}

export interface RelayContext {
  /** 投稿者の Cernere 表示名 (getIdentity(c).displayName)。匿名投稿では使わない。 */
  authorDisplayName: string | null | undefined;
  /** GLAB の公開 URL (env CORPUS_PUBLIC_URL)。 */
  publicUrl: string | null | undefined;
}

/**
 * 作成された感想からリレー行を組み立てる。
 * - コミュニティ公開 (`visibility === 'community'`) 以外は流さない → null
 * - URL が組めない (公開 URL 未設定) 場合も流さない → null (呼び出し側が warn)
 */
export function relayFromCreatedReview(
  record: CreatedReviewRecord,
  context: RelayContext,
): NewReviewRelay | null {
  if (record.visibility !== 'community') return null;
  const projectId = record.glabProjectId ?? null;
  const url = reviewUrl(context.publicUrl, projectId);
  if (!url) return null;
  return {
    reviewId: record.id,
    projectId,
    gameTitle: outboundText(record.gameTitle, MAX_TITLE_LENGTH),
    recommend: record.recommend === true || record.recommend === false ? record.recommend : null,
    excerpt: outboundText(record.comment ?? '', MAX_EXCERPT_LENGTH),
    author: record.anonymous
      ? ANONYMOUS_AUTHOR
      : outboundText(context.authorDisplayName, MAX_AUTHOR_LENGTH) || FALLBACK_AUTHOR,
    url,
  };
}
