---
task: odeum-live-presentation
project: glab
kind: implementation
created: 2026-10-04
memory_links:
  - spec/plan/2026-10-04-odeum-live-presentation-design.md
---

# GLab: Odeum ライブ発表の一覧・視聴・リアクション (`odeum` プラグイン)

設計の正本: `spec/plan/2026-10-04-odeum-live-presentation-design.md` (このリポ内のコピー)。特に「GLab: `odeum` プラグイン」「チケット」「WebSocket メッセージ」「メディア」節。最小版・スタブで済ませない。

## 背景 (neco 2026-10-04)

- 発表者が自分の画面を配信し、GLab ユーザーがグッド・スタンプ・コメント・投票回答を返す。配信と中継は Odeum (旧 Spectator、`LUDIARS/Odeum`) のネイティブ中継サーバ `odeum-relay` が担う (別タスクで実装中)。
- GLab にログインしたとき、発表中のイベントがあればそれを確認できること。
- 視聴とリアクションは GLab の Web 画面で行う。

## やること

1. **プラグイン `plugins/odeum/`** を既存プラグイン (`events` など) と同じ作りで追加し、`plugins/pack.json` の modules に登録する。
2. **発表セッション台帳** (GLAB DB): `glab_odeum_sessions` (id, event_id, presenter_user_id, status `live`/`ended`, started_at, ended_at)。イベントの正本は既存の GLAB イベントストア (`plugins/events`)。DB schema は `plugins/data.ts` に集約し、migration 規約 (INDEX は ALTER の後、冪等) に従う。イベントが別ストア (PostgreSQL) にある場合は event_id の参照だけを持つ。`CLAUDE.md` の作業規則 (corpus/ 不可侵、sdk.ts 経由 import、build:panels 登録) を守る。
3. **チケット発行** (サーバ側): Ed25519 の JWS (`alg: EdDSA`, `kid`)。claims は設計書のとおり (`iss: glab`, `aud: odeum-relay`, `sub`, `name`, `role`, `sid`, `exp` ≤ 5 分, `jti`)。秘密鍵は Excubitor Vault から注入される secret として受け取り (GLAB の Vault-only 起動、`.env` 不可)、必須 env 検証に加える。鍵が無いときは odeum 機能だけを無効にし、hub 全体の起動は止めない。公開鍵を `kid` 付きで書き出す手段 (中継の `ODEUM_RELAY_TICKET_PUBKEYS` 用 JSON) を用意する。
4. **発表開始/終了 API**: イベント作成者または GLab 管理者だけが開始できる。開始でセッションを作り presenter チケットを発行し、`odeum://present?relay=<wss URL>&ticket=<JWS>` を返す。終了で `ended`。
5. **ログイン時の「いま発表中」カード**: ダッシュボード上部に live セッションがあるときだけ出す。中継の `GET /v1/sessions` (`role=service` チケット) で `presenter_connected` と `viewer_count` を取り、切断中は「接続待ち」と出す。中継へ届かないときもカード自体は台帳から出す (縮退)。
6. **視聴画面**: viewer チケットで `GET /v1/ws` に接続し、受信専用 WebRTC で `<video>` 再生。投票の回答、視聴者数。リアクションは 3 領域に分ける (neco 指示):
   - **グッド**: 画面で最も大きいボタン (スマホでは幅いっぱい・高さ 96px 以上)。押すたびに即時の手応え (アニメーションと自分の押下数)。送信は 200ms ごとに `{"type":"good","count":n}` でまとめる。長押しは連打扱いにしない。
   - **スタンプ**: グッドとは別の列に小さめのボタン (`clap`/`laugh`/`wow`/`question`/`agree`)。
   - **コメント**: 任意文字列 (≤280 文字) の入力欄と送信ボタン。スタンプ列とは分ける。
   - `reaction.burst` を受けて全体のグッドの盛り上がりを表示する。`rate_limited` は控えめに知らせる。
7. **中継の URL** は Excubitor topology の `ODEUM_RELAY_URL` から解決する (ハードコードしない)。未設定時は機能を無効表示にする。
8. ステータス画面の接続サービス集約に `odeum-relay` の health を足す (既存の service-health-connector の流儀)。
9. 仕様: `spec/feature/odeum-live-presentation.md` を追加し、README の機能表に 1 行足す。

## 受入条件

- テスト: チケット発行 (claims・期限・kid・署名を公開鍵で検証できる)、開始権限 (作成者/管理者のみ)、台帳の状態遷移、ダッシュボードの live 抽出、グッドの 200ms まとめ送信 (タイマーを差し替えて検証)、中継不達時の縮退。既存のテスト基盤 (`tests/`) で書く。
- テストの実行は依頼者の許可範囲に従い、未実施は PR に未実施と書く。
- 個人データ: チケットとメッセージに載せるのは Cernere user_id と表示名だけ。ログにコメント本文やチケットを出さない。

## 作業の進め方

- この worktree で作業し、ブランチは現在のものを使う。`git add <パス>` + `git commit` は可 (パス指定で stage、`git add -A` は使わない。`corpus/` submodule は触らない)。
- Anatomia は `node E:/Document/Ars/Anatomia/bin/anatomia.mjs` で呼ぶ。
- local PR は Concordia の `/v1/prs/local/direct` で提出する。完了報告は delegation status へ送る。Actio の本文 API が取れなければこのファイルを本文として扱う。
