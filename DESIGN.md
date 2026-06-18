# GLAB 設計

## 1. 目的・スコープ

学校組織 GLAB（Vantan Game Academy のゲーム制作ラボ）の運営を一箇所に集約する hub。
対象機能は 5 つ：集会出席管理 / 施設予約 / イベント通知 / 就活情報の投稿 / LLM やりとり。
ユーザは Cernere で一元管理する。

「小さく作る」方針：既存サービス（Aedilis / Ostiarius / Cernere）で済むものは流用し、
GLAB 固有のデータ（イベント・就活情報）と運用面（Discord）だけを自前で持つ。

## 2. アーキテクチャ

GLAB は **2 つのランタイム**からなる：

1. **Web hub** — Corpus（submodule）に GLAB プラグインパック（`plugins/`）を載せた派生 hub。
   管理者・メンバーの閲覧/設定面。`server.ts` が Corpus を `CORPUS_PLUGIN_DIR=plugins` で起動。
2. **Discord Bot**（`bot/`）— discord.js Gateway 常時接続の別プロセス。日常運用面
   （イベント通知・就活投稿・LLM 対話）。

両者は **同じ SQLite（`data/corpus.db`、WAL）** を共有する。これにより Web で登録した
イベント/就活を Bot が通知し、Bot で投稿したものを Web で閲覧できる。スキーマとクエリは
`plugins/data.ts` に一元化して齟齬を防ぐ（hub は `ctx.db`、Bot は better-sqlite3 で同ファイルを開く）。

```
        Cernere (認証)
            │
   ┌────────┴─────────┐
   ▼                  ▼
Web hub (Corpus)   Discord Bot
 plugins/           bot/
  attendance ──┐     │
  facility ────┼─────┼──► Aedilis + Ostiarius (出席/施設予約)
  events ──────┤     │
  jobs ────────┘     │
        │            │
        └─ data/corpus.db (WAL 共有) ─┘
                     │
                     └──► LLM (claude-cli / anthropic)
```

## 3. モジュール（Web hub plugins/）

| id | 種別 | 内容 |
|---|---|---|
| `attendance` | コネクタ | Aedilis `/api/checkin/*` を中継。自分の出席履歴 + (admin) 全員。出席記録自体は Ostiarius の passkey チェックインで生成される |
| `facility` | コネクタ | Aedilis `/api/facilities`・`/api/reservations` を中継。施設一覧 + 予約作成/取消 |
| `events` | 自前データ | イベントの登録/一覧/削除。`glab_event` テーブル |
| `jobs` | 自前データ | 就活情報の投稿/検索/クローズ。`glab_job` テーブル |

コネクタモジュールは Aedilis 未稼働時は connector が 503 を返し、パネルが「未接続」を表示する
degraded モードで動く。

## 4. データ共有（hub ↔ Bot）

- スキーマ正本：`plugins/data.ts`（`GLAB_SCHEMA` + 型 + クエリ関数）。
- hub プラグインは `ensureSchema(ctx.db)`、Bot は `openSharedDb()` 内で `ensureSchema()` を呼ぶ
  （どちらが先に起動しても冪等）。
- 二重通知防止：イベントは `notified_at`、就活締切は `deadline_notified_at` で既通知を管理。
- DB は構造的インターフェース `SqlDb` で受け、CorpusDb / better-sqlite3 の両方を満たす
  （import 結合を避ける）。

## 5. Discord Bot（bot/）

- **Transport**：discord.js Gateway（常時接続。公開 URL / Interactions Endpoint 不要）。
- **コマンド**：`/event add|list`、`/job add|list|close`、`/chat`。
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

hub 側の設定（Cernere / Aedilis URL / admin）は Corpus 既定の Infisical（env-cli）系統で運用する。

## 7. 認証

Cernere（PASETO V4）。Web hub は Corpus が `requireAuth` で検証し、プラグインは
`getIdentity(c)` で `userId / displayName / isAdmin` を得る。コネクタは受信した Bearer を
そのまま Aedilis へ透過する（ユーザ権限を保存）。Discord Bot はメンバーの Discord ID を
そのまま行為主体とする（v0.1 では Cernere との突合はしない）。

## 8. オープン論点 / follow-up

- Discord ↔ Cernere アカウント突合（投稿者の本人性）。
- LLM `local`（OpenAI 互換 / Gemma）backend の追加。
- Electron マスコット（VantanHub `desktop/` 流用）。v0.1 はスコープ外。
- イベント/就活の宣言的 UI（Corpus declarative panel）への移行。v0.1 は micro-frontend panel。
- 出席の集計ビュー（期間別・人別）。
