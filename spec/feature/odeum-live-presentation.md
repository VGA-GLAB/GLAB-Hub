---
feature: odeum-live-presentation
plugin: odeum
status: implemented
task: actio:a3527691-cd78-497e-8ede-07d7f224706a
design: spec/plan/2026-10-04-odeum-live-presentation-design.md
---

# Odeum ライブ発表 (`odeum` プラグイン)

スマホのツッコミ・質問／感想の投稿者選択表示は
[`odeum-sender-reactions.md`](odeum-sender-reactions.md) を参照。

発表者が自分の画面を配信し、GLab ユーザーが Web 画面で視聴してグッド・スタンプ・コメント・
投票回答を返す。配信と中継は Odeum の `odeum-relay` (ネイティブ SFU) が担い、GLab は
**発表セッション台帳・権限・チケット発行・視聴画面**を持つ。設計の正本は
`spec/plan/2026-10-04-odeum-live-presentation-design.md`。

## 構成

| ファイル | 責務 |
|---|---|
| `plugins/odeum/index.ts` | モジュール登録。設定解決、`odeum-relay` health コネクタ、ルート、パネル |
| `plugins/odeum/config.ts` | `ODEUM_RELAY_URL` と署名鍵の解決。欠落時は理由つきで無効 |
| `plugins/odeum/ticket.ts` | Ed25519 JWS チケットの発行、公開鍵 JSON の生成 |
| `plugins/odeum/session-store.ts` | 台帳 `glab_odeum_sessions` のクエリ (スキーマは `plugins/data.ts`) |
| `plugins/odeum/permissions.ts` | 開始 / 終了の権限 |
| `plugins/odeum/relay-client.ts` | 中継の `GET /v1/sessions` (service チケット)。不達は null |
| `plugins/odeum/live-cards.ts` | ダッシュボード「いま発表中」カードの抽出 (純関数) |
| `plugins/odeum/routes.ts` | `/api/x/odeum/*` |
| `plugins/odeum/panel.ts` ほか | 視聴画面 (`viewer-ui.ts` / `viewer-connection.ts` / `good-batcher.ts`)、発表中カード (`live-card.ts`)、イベント行の開始操作 (`present-controls.ts`) |
| `scripts/odeum-ticket-pubkeys.ts` | 中継用の公開鍵 JSON を書き出す (`npm run odeum:pubkeys -- --out <path>`) |

## 台帳 (GLAB SQLite `data/corpus.db`)

`glab_odeum_sessions (id, event_id, presenter_user_id, status, started_at, ended_at)`

- イベントの正本は GLAB PostgreSQL (`plugins/events`)。台帳は `event_id` の参照だけを持つ。
- `status` は `live` → `ended` の一方向。`ended` から戻さず、再開は新しいセッションを作る。
- 1 イベントに `live` は 1 件 (部分 UNIQUE INDEX)。同じ発表者が再度開始すると既存セッションを
  返し (発表者アプリの再起動用)、別の人なら 409 `session_already_live`。
- 発表者は Cernere user_id の参照のみ。表示名は Corpus の display-name キャッシュから引く。

## 設定 (Excubitor 注入)

| env | 種別 | 内容 |
|---|---|---|
| `ODEUM_RELAY_URL` | 非 secret (topology) | 中継の URL。`http(s)` / `ws(s)` どちらでも可。HTTP base と WS base を導出する |
| `GLAB_ODEUM_TICKET_PRIVATE_KEY` | secret (Ex Vault) | Ed25519 秘密鍵 (PKCS#8 PEM。`\n` エスケープ可) |
| `GLAB_ODEUM_TICKET_KID` | secret と同時に登録 | チケットヘッダの `kid` |

- `server.ts` は `requireInjectedEnvironment` の直後に `inspectOdeumEnvironment` で上記を検査し、
  欠けていればキー名だけを警告する。**hub の起動は止めず odeum 機能だけを無効**にする。
- 鍵の生成: `openssl genpkey -algorithm ed25519 -out odeum-ticket.pem`。公開鍵は
  `npm run odeum:pubkeys -- --out <path>` (Vault 注入下) か、管理者の `GET /api/x/odeum/ticket-pubkeys`
  で `{ "<kid>": "<PEM>" }` を得て、中継の `ODEUM_RELAY_TICKET_PUBKEYS` が指すファイルに置く。
- 鍵の入れ替えは新しい `kid` で行い、中継側の JSON に新旧両方を並べてから GLab の鍵を切り替える。

## チケット

JWS compact、`alg: EdDSA`、`kid` 必須。claims は `iss: glab`, `aud: odeum-relay`, `sub`
(Cernere user_id)、`name` (≤64 文字に切り詰め)、`role` (`presenter` / `viewer` / `service`)、
`sid` (service では省略)、`exp`、`jti`。有効期限は presenter 300 秒、viewer 120 秒、service 60 秒
(上限 300 秒)。チケットはログに出さない。

## API (`/api/x/odeum`)

| メソッド | パス | 権限 | 内容 |
|---|---|---|---|
| GET | `/status` | ログイン | `{ enabled, reason }` |
| GET | `/live` | ログイン | 閲覧できるイベントの live セッションのカード。中継不達でも台帳から返す (`relayState: unknown`) |
| POST | `/sessions` `{eventId}` | イベント作成者 / 管理者 | セッション作成 (または同じ発表者の再開) と presenter チケット → `presentUrl: odeum://present?relay=<wss URL>&ticket=<JWS>` |
| POST | `/sessions/:id/end` | 発表者 / イベント作成者 / 管理者 | `ended` にする (冪等) |
| POST | `/sessions/:id/viewer-ticket` | イベントを閲覧できる人 | `{ wsUrl, ticket, eventTitle, self }` |
| GET | `/ticket-pubkeys` | 管理者 | 中継用の公開鍵 JSON |

odeum が無効なときチケットを要する操作は 503 `odeum_disabled` を返す。イベントの閲覧可否は
`plugins/roles/audience.ts` の `canSee` (events と同じ規則)。

## 画面

- **ダッシュボード上部「いま発表中」**: live セッションがあるときだけ出す。中継の状態で
  「配信中」/「接続待ち」/「中継の状態を確認できません」(縮退) と視聴者数を表示し、その場で視聴できる。
- **イベント画面**: 作成者 / 管理者のイベント行に「発表を始める」。押すと `odeum://` で発表者アプリを
  起動し、起動できなかったときのためにリンクを残す。発表中は「発表を終了」。
- **ライブ発表パネル / 視聴画面**: viewer チケットで中継の `GET /v1/ws` に接続し、受信専用 WebRTC
  (`recvonly`) で `<video>` 再生。視聴者数 (`presence`)、投票 (`poll.open` / `tally` / `poll.closed`、
  `poll.answer` で回答・再送で上書き)。リアクションは 3 領域に分ける。
  - **グッド**: 画面で最も大きいボタン (スマホは幅いっぱい・高さ 96px 以上)。押すたびにアニメーションと
    自分の押下数を即時に出し、送信は 200ms ごとに `{"type":"good","count":n}` でまとめる (1 メッセージ
    最大 50、超過は次の窓へ繰り越し)。キーリピートと長押しメニューは連打扱いにしない。
  - **スタンプ**: 別の列に `clap` / `laugh` / `wow` / `question` / `agree`。
  - **コメント**: 280 文字までの入力欄と送信ボタン。スタンプ列とは分ける。
  - `reaction.burst` で全体のグッドの累計と盛り上がりメーター、スタンプ件数を出す。
    `error code=rate_limited` は「少し間をおいてから送ってください」と控えめに出す。

## ステータス

`odeum-relay` を `VersionedHttpServiceConnector` (health `/health`) として登録し、ステータス画面の
接続サービス集約に載せる。`ODEUM_RELAY_URL` 未設定時は degraded (接続先未設定)。

## 個人データ

チケットとメッセージに載せるのは Cernere user_id と表示名だけ。ログにはセッション id と
イベント id だけを出し、コメント本文やチケットは出さない。

## テスト

`tests/odeum-*.test.ts`: チケット (claims・期限・kid・公開鍵での署名検証・改ざん検出)、開始権限、
台帳の状態遷移と 1 イベント 1 live、ダッシュボードの live 抽出、グッドの 200ms まとめ送信
(タイマー差し替え)、中継不達時の縮退、env 欠落時に odeum だけ無効になること。
