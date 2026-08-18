# Volputas review relay (GLAB 側キューイング)

感想の入口は GLAB の `POST /api/x/volputas/reviews` (認証済みユーザ) だけで、GLAB は
それを Volputas `POST /api/v1/integrations/glab/reviews` に proxy して保存させる。
Volputas が 201 `{ ok, data: { record } }` を返したら、GLAB がその record から
リレー行を組み立てて SQLite キュー `glab_review_relay` に積む
(`plugins/volputas/review-relay.ts` の `parseCreatedReview` / `relayFromCreatedReview`)。
Volputas から GLAB への折り返し (`/external/review-relay` + `X-Glab-Service-Token`) は
2026-08-18 に撤去した — GLAB がフロントなので Volputas 側に GLAB の所在も token も要らない
(neco 裁定、`spec/plan/glab-community-activation.md` §1.2)。

リレー対象は `visibility === 'community'` の record だけ。行は `reviewId` (= record.id)、
`projectId` (= glabProjectId)、`gameTitle` (120 文字)、`recommend` (boolean|null)、
`excerpt` (= comment、300 文字)、`author` (匿名なら「匿名」、そうでなければ認証 identity の
表示名 80 文字、無ければ `Player`)、`url` (GLAB の `CORPUS_PUBLIC_URL` に `?projectId=` を付けた
GLAB 自身へのリンク)。`@everyone` / `@here` / `<@…>` は組み立て時にゼロ幅スペースで中和する。
`CORPUS_PUBLIC_URL` が無い / 応答の形が想定外のときはキューせず warn を出し、投稿応答は
そのまま返す (リレーの失敗で投稿を失敗にしない)。

`reviewId` は主キーで `ON CONFLICT DO NOTHING` (`queueReviewRelay`)。テーブルは他モジュールの
読み込み順に依存しないよう、volputas 自身が `ensureSchema(ctx.db)` で冪等初期化する。

bot scheduler は未投稿を最大 10 件、古い順に専用 review channel
（bot 暗号化 config `GLAB_REVIEW_CHANNEL_ID` → `channels.review`）へ投稿する。Discord が
成功した場合だけ `posted_at` と `message_id` を更新し、失敗分は次 tick で再試行する。
channel 未設定時は投稿を試みず（起動時に警告を 1 度出す）、キューに滞留させる =
設定後に古い順から配信される。

投稿では `allowedMentions: { parse: [] }` を必ず指定し、ユーザ入力による全メンションを
無効化する。2,000 文字に収める切り詰めは可変長の `excerpt` だけを対象とし、投稿者と URL は
常に残す（出典を消さない）。サロゲートペアは分割しない。

## 関連

- 計画: `spec/plan/glab-community-activation.md`
- コード: `plugins/volputas/index.ts` / `plugins/volputas/review-relay.ts` /
  `plugins/data.ts`（`glab_review_relay`）/ `bot/notify/scheduler.ts` / `bot/format.ts` /
  `bot/channels.ts`
- テスト: `tests/review-relay-contract.test.ts` / `tests/review-relay-builder.test.ts`
