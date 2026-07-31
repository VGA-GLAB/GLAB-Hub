# 相談とおれひま

相談は GLAB の `glab_consult` に記録し、bot が GLAB external API 経由で Discord フォーラムのスレッドを作る。bot は Cernere に直接接続しない。相談作成はユーザごとに60秒間隔で制限し、連続作成には 429 を返す。

おれひまの正本は Cernere の `glab_presence` である。GLAB は厳格に RPC 応答を検証し、未接続・不正応答は `cernere_unavailable` の 503 として明示する。Discord の `/orehima` は Discord ID を GLAB external API に渡して本人を解決する。

external API は service token を必須にし、応答に `cache-control: private, no-store` を付ける。Discord の相談スレッドでは `allowedMentions` の `parse` を空にし、招集対象として解決済みの個人 Discord ID だけを users allowlist に渡す。未設定の GLAB URL、service token、またはチャンネルは degraded として該当機能を実行しない。

bot からの到達パスは `/api/x/consult/external/...` である（Corpus がモジュールを `/api/x/<moduleId>` に mount するため。projects と同じ事情で spec/interface/projects-registry.md に既出）。`GLAB_BASE_URL` には hub のルートだけを入れる。

投稿台帳は片方向に進む。スレッド作成の記録は `posted_at`、解決スレッドのアーカイブ完了は `resolved_posted_at` に bot の ack で記録し、ack 済みの相談は各 external フィードから外す（同じスレッドを毎 tick 触らない）。相談 1 件の失敗は他の相談と後続の通知を止めない。タイトル・本文は Discord のスレッド名 100 字 / メッセージ 2000 字の上限で丸める（超過は恒久失敗となり再試行ループになるため）。

`/orehima` は「hub に到達できなかった」と「hub は応答したが Discord 未連携（`null`）」を区別して案内する。

**未解決（要決着）**: Corpus は `/api/*` 全体に `requireAuth`（Cernere accessToken 検証）を掛けており、service token はその **内側** の追加ゲートでしかない（projects と同じ制約）。bot は現状 Cernere の bearer を持たないため、service token だけの呼び出しは `401 unauthorized` で弾かれる。bot 用の Cernere 資格情報を配るか、hub 側に service token 単独で通せる到達経路を用意するまで、相談の Discord 連携と `/orehima` は degraded のまま動かない。
