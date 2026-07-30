# Volputas review relay receiver

Volputas はコミュニティ公開を選んだ感想を、GLAB の
`POST /api/x/volputas/external/review-relay` に送る。認可は
`X-Glab-Service-Token` または Bearer service token で、未設定時は 503、認証失敗時は 401。
token は projects の外部 read API と同じ env `GLAB_PROJECTS_SERVICE_TOKEN` /
`requireServiceToken` を再利用する（`spec/plan/glab-community-activation.md`、
二重ゲートの理由は `spec/interface/projects-registry.md` と同じ）。

リクエストは strict JSON の `reviewId`, `projectId`, `gameTitle`, `recommend`, `excerpt`,
`author`, `url` からなる。全項目に長さ上限を課し（`reviewId` / `gameTitle` 200、`author` 100、
`excerpt` 2,000、`url` 500）、受け口の時点で保存量と Discord 1 メッセージ上限を有界にする。
契約不正は `400 { error: 'invalid_review_relay', fields }`。

GLAB は `reviewId` を主キーとして SQLite キュー `glab_review_relay` に保存し、同一 ID の
再送には `200 { queued: false, reason: 'already-queued' }` を返す（既存行は上書きしない）。
新規は `201 { queued: true }`。すべての応答は `cache-control: private, no-store` を付ける。
テーブルは他モジュールの読み込み順に依存しないよう、volputas 自身が `ensureSchema(ctx.db)`
で冪等初期化する。

bot scheduler は未投稿を最大 10 件、古い順に専用 review channel
（env `GLAB_REVIEW_CHANNEL_ID`）へ投稿する。Discord が成功した場合だけ `posted_at` と
`message_id` を更新し、失敗分は次 tick で再試行する。channel 未設定時は投稿を試みず
（起動時に警告を 1 度出す）、キューに滞留させる = 設定後に古い順から配信される。

投稿では `allowedMentions: { parse: [] }` を必ず指定し、ユーザ入力による全メンションを
無効化する。2,000 文字に収める切り詰めは可変長の `excerpt` だけを対象とし、投稿者と URL は
常に残す（出典を消さない）。サロゲートペアは分割しない。

## 関連

- 計画: `spec/plan/glab-community-activation.md`
- コード: `plugins/volputas/index.ts` / `plugins/data.ts`（`glab_review_relay`）/
  `bot/notify/scheduler.ts` / `bot/format.ts` / `bot/channels.ts`
- テスト: `tests/review-relay-contract.test.ts`
