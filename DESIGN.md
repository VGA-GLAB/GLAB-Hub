# GLAB 設計

## 1. 目的・スコープ

学校組織 GLAB（Vantan Game Academy のゲーム制作ラボ）の運営を一箇所に集約する hub。
対象機能は、集会出席管理 / 施設予約 / イベント通知 / 就活情報 / 志望・内定企業 /
ゲームレビュー / ゲーム嗜好アンケート / 議論 / 学習ビュー / LLM やりとり。
ユーザは Cernere で一元管理する。

「小さく作る」方針：既存サービス（Aedilis / Cernere）で済むものは流用し、
GLAB 固有のデータ（ユーザ参照・出席状況・イベント）と運用面（Discord）だけを自前で持つ。

## 2. アーキテクチャ

GLAB は **2 つのランタイム**からなる：

1. **Web hub** — Corpus（submodule）に GLAB プラグインパック（`plugins/`）を載せた派生 hub。
   管理者・メンバーの閲覧/設定面。`server.ts` が Corpus を `CORPUS_PLUGIN_DIR=plugins` で起動。
2. **Discord Bot**（`bot/`）— discord.js Gateway 常時接続の別プロセス。日常運用面
   （イベント通知・就活投稿・LLM 対話）。

Web hubとBotはイベントだけを **GLAB PostgreSQL** で共有する。SQLite
（`data/corpus.db`、WAL）は現在の出席状況とBot求人等のローカル運用データに限定する。
在校生/OBの就活データとゲームレビュー回答はCernere共有schemaを使う。

```
        Cernere (認証)
            │
   ┌────────┴─────────┐
   ▼                  ▼
Web hub (Corpus)   Discord Bot
 plugins/           bot/
  attendance ──┐     │
  events ──────┼─────┤
  jobs ────────┘     │
  facility ─────────────► Aedilis (施設予約)
  volputas ─────────────► Volputas (ゲーム定性評価 / 嗜好アンケートUI)
  di ───────────────────► Di (議論 / 学習ビュー)
  tirocinium ────────────► Tr (企業検索 / 志望・内定企業)
        │            │
        ├─ GLAB PostgreSQL (イベント共有) ─┤
        └─ data/corpus.db (出席 / Bot求人) ─┘
                     │
                     └──► LLM (claude-cli / anthropic)
```

## 3. モジュール（Web hub plugins/）

| id | 種別 | 内容 |
|---|---|---|
| Corpus内蔵ステータス | コネクタ集約 | 各実モジュールが登録するCr / Os / Ae / Vo / Di / Trのhealth・versionを集約 |
| `attendance` | 自前データ + コネクタ | 進行中イベント + Os passkey → Aedilis `/api/checkin/verify` で attestation 検証後に直近出席を`glab_user`へ記録 |
| `facility` | コネクタ | Aedilis `/api/facilities`・`/api/reservations` をproject token付きで中継 |
| `events` | 自前データ | GLAB PostgreSQLだけでイベントを登録/削除。施設名/IDと利用時間を保持 |
| `jobs` | 自前データ + コネクタ | 求人情報の投稿/検索/クローズ (`glab_job`、Bot `/job` と共有)。本人の就活データは `/career` で Cernere `tirocinium_student_career` へ中継 |
| `tirocinium` | コネクタ | Trの企業マスタを検索し、Cernere IDに紐づく志望企業、内定企業・職種・内定日を登録 |
| `volputas` | コネクタ | 唯一の「レビュー」パネル。Volputas設問とCernere回答をCorpus内の3タブで表示 |

アンケート設問はVolputas、回答はCernereのTEXT/INTEGER正規化テーブルを正本とする。
GLABはVolputasが本人向けにフィルタしたデータを中継し、Corpus内で表示・回答するだけとする。

企業の公開情報はTrが正本であり、GLABに複製しない。OB会社情報は
`tirocinium_alumni_career`、在校生の就活データと公開フラグは
`tirocinium_student_career`を使う。GLABは在校生schemaだけへ接続する。

施設・外部サービスのコネクタは接続先未設定時も GLAB を停止せず、パネルが「未接続」を表示する
degraded モードで動く。設定値が存在するのに URL が不正な場合は起動時に拒否する。

## 4. データ共有（hub ↔ Bot）

- イベントのスキーマ正本：`plugins/events/store.ts`（GLAB PostgreSQL）。
- SQLiteのスキーマ正本：`plugins/data.ts`（`glab_user` / Bot求人等）。
- hub プラグインは `ensureSchema(ctx.db)`、Bot は `openSharedDb()` 内で `ensureSchema()` を呼ぶ
  （どちらが先に起動しても冪等）。
- 二重通知防止：PostgreSQLイベントは `notified_at`、Bot求人締切はSQLiteの `deadline_notified_at` で管理。
- DB は構造的インターフェース `SqlDb` で受け、CorpusDb / better-sqlite3 の両方を満たす
  （import 結合を避ける）。

## 5. Discord Bot（bot/）

- **Transport**：discord.js Gateway（常時接続。公開 URL / Interactions Endpoint 不要）。
- **コマンド**：`/event list`、`/job add|list|close`、`/chat`。イベント作成は施設予約を必須にするWebへ一本化。
- **LLM**：`bot/llm/` の `LlmClient` 抽象。backend = `claude-cli`（既定、Lictor/サブスク経由で
  API キー不要）/ `anthropic`（API 直叩き）/ `mock`。local（OpenAI 互換）は follow-up。
- **通知スケジューラ**（`bot/notify/scheduler.ts`）：定期ポーリングで「もうすぐのイベント」
  「締切が近い就活」を `#event` / `#job` へ投稿。Web 登録分も拾う。
- **権限**：`/job close` 等は投稿者 or `adminUserIds`（Discord ユーザ ID）。

## 6. 設定（暗号化 config）

Bot の token / API キー / チャンネル ID は **暗号化 config**（`@ludiars/encrypted-config`、
AES-256-GCM + scrypt）に保存する。平文 JSON を置かない。

- 保存先：`bot/glab-bot.config.json`（gitignore 済）。token / API キーは暗号化、
  channel id / backend 等は平文。
- 暗号鍵：env `GLAB_BOT_MASTER_KEY` → マシン束縛値（`glab-bot:hostname:user`）。
  マシンごとに `npm run config-setup` を実行。
- 読込順：env > 暗号化 config > 既定（`bot/config.ts`）。CI/上書きは env で。

hub 側の通常起動はExcubitorが担当する。ExはCernere/Aedilis/Volputas/Di/Trを起動し、Osは会場LANで起動する。
各backendのhealthは`version`を返し、GLABの単一「ステータス」タブが接続先全件を表示する。
GLAB起動ごとに生成したCernere project credentialとCernere admin IDをspawn envへ直接渡す。
GLAB自身のInfisical（env-cli）経路は単独開発用フォールバックとして残す。

## 7. 認証

Cernere（PASETO V4）。Web hub は Corpus が `requireAuth` で検証し、プラグインは
`getIdentity(c)` で `userId / displayName / isAdmin` を得る。Aedilisコネクタは受信user tokenを
Corpus `TokenProvider`でAedilis向けproject tokenへ交換する。Discord Bot はメンバーの Discord ID を
そのまま行為主体とする（v0.1 では Cernere との突合はしない）。

ログインUIはGLAB内に埋め込み、Cernere frontendへredirectしない。Corpus backendは起動時に
`project_credentials`でCernere `/ws/project`へ事前接続し、その認証済みチャネルから
Composite認証を開始する。交換後のaccess/refresh tokenはGLAB originのHttpOnly Cookieだけに
保持し、access失効時はCorpusがrefreshを一度だけ実行してCookieをローテーションする。
ブラウザのlocalStorageにはtokenを保存しない。

GLAB の初回アクセスでは、全パネル共通ゲートが Cernere の `vantan_user` を確認する。
`name`（名前）・`role_title`（役職）・`department_name`（学科）のいずれかが未登録なら
登録フォームを表示し、完了するまで通常パネルを描画しない。GLAB server は
`project_credentials` で Cernere `/ws/project` に接続し、`data_sharing: readwrite` の
許可範囲だけを読み書きする。プロフィール値を GLAB の SQLite へ複製しない。
一方、Cernere の `user_id` と現在の出席状況は `glab_user` に保存し、GLAB が正本を持つ。

project credentialは固定保存しない。Excubitorがspawn直前にsecretを生成してCernereへ送り、
Cernereが現行bcrypt hashとAES-256-GCM暗号履歴をDBへ永続化する。Exは返されたclient IDと
自分が生成したsecretをこのGLABプロセスのenvにだけ注入する。

## 8. オープン論点 / follow-up

- Discord ↔ Cernere アカウント突合（投稿者の本人性）。
- LLM `local`（OpenAI 互換 / Gemma）backend の追加。
- Electron マスコット（VantanHub `desktop/` 流用）。v0.1 はスコープ外。
- イベント/就活の宣言的 UI（Corpus declarative panel）への移行。v0.1 は micro-frontend panel。
- 出席の集計ビュー（期間別・人別）。
