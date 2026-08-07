# 相談とおれひま

相談は GLAB の `glab_consult` に記録し、bot が GLAB external API 経由で Discord フォーラムのスレッドを作る。bot は Cernere に直接接続しない。相談作成はユーザごとに60秒間隔で制限し、連続作成には 429 を返す。

おれひまの正本は Cernere の user_data (列 available_now / available_until) である。Cernere はサービス固有の presence コマンドを持たず、GLAB は汎用の `managed_project.list_user_data` / `set_user_data` / `resolve_user_by_claim` を使う。列の宣言は GLAB 側 (plugins/consult/presence-schema.ts) が起動時に update_schema で行う。GLAB は厳格に RPC 応答を検証し、未接続・不正応答は `cernere_unavailable` の 503 として明示する。Discord の `/orehima` は Discord ID を GLAB external API に渡して本人を解決する。

external API は service token を必須にし、応答に `cache-control: private, no-store` を付ける。Discord の相談スレッドでは `allowedMentions` の `parse` を空にし、招集対象として解決済みの個人 Discord ID だけを users allowlist に渡す。未設定の GLAB URL、service token、またはチャンネルは degraded として該当機能を実行しない。

## Presence contract

- **SPEC-CONSULT-PRESENCE-001**: 利用可能なメンバーは `managed_project.list_user_data` で `available_now=true` と `available_until` の有効期限を Cernere 側で絞り込み、`discord_id` claim を含めて取得する。不正な応答は受理しない。
- **SPEC-CONSULT-PRESENCE-002**: Discord ID からの本人解決は `managed_project.resolve_user_by_claim` を `discord_id` claim に限定して行い、未連携は `null` として返す。
- **SPEC-CONSULT-PRESENCE-003**: 利用可否は本人が解決された Cernere user ID に対し `managed_project.set_user_data` で `available_now` と `available_until` だけを更新する。
- **SPEC-CONSULT-PRESENCE-004**: GLAB は起動時に `available_now` と `available_until` を部分 schema 更新で宣言し、最初の presence 操作はその宣言完了を待つ。宣言失敗はログに記録し、hub 全体の起動は継続する。

bot からの到達パスは `/api/x/consult/external/...` である（Corpus がモジュールを `/api/x/<moduleId>` に mount するため。projects と同じ事情で spec/interface/projects-registry.md に既出）。`GLAB_BASE_URL` には hub のルートだけを入れる。

投稿台帳は片方向に進む。スレッド作成の記録は `posted_at`、解決スレッドのアーカイブ完了は `resolved_posted_at` に bot の ack で記録し、ack 済みの相談は各 external フィードから外す（同じスレッドを毎 tick 触らない）。相談 1 件の失敗は他の相談と後続の通知を止めない。タイトル・本文は Discord のスレッド名 100 字 / メッセージ 2000 字の上限で丸める（超過は恒久失敗となり再試行ループになるため）。

`/orehima` は「hub に到達できなかった」と「hub は応答したが Discord 未連携（`null`）」を区別して案内する。

**未解決（要決着）**: Corpus は `/api/*` 全体に `requireAuth`（Cernere accessToken 検証）を掛けており、service token はその **内側** の追加ゲートでしかない（projects と同じ制約）。bot は現状 Cernere の bearer を持たないため、service token だけの呼び出しは `401 unauthorized` で弾かれる。bot 用の Cernere 資格情報を配るか、hub 側に service token 単独で通せる到達経路を用意するまで、相談の Discord 連携と `/orehima` は degraded のまま動かない。
