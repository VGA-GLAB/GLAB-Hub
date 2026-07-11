# GLAB

学校組織 **GLAB**（Vantan Game Academy のゲーム制作ラボ）の運営 hub。
[Corpus](https://github.com/LUDIARS/Corpus)（汎用 hub フレームワーク）を submodule で取り込み、
GLAB 特化のプラグインパックと Discord Bot を載せた派生 hub。

## 機能

| 機能 | 実現方法 |
|---|---|
| 集会出席管理 | Web hub `attendance` → GLAB SQLite に `user_id` と現在の出席状況を保管 |
| 施設予約 | Web hub `facility` → Aedilis の予約 API に接続 |
| イベント通知 | Discord Bot `/event` + 定期リマインド（自前 DB、Web hub `events` と共有） |
| 就活情報の投稿 | Discord Bot `/job` + 締切リマインド（自前 DB、Web hub `jobs` と共有） |
| LLM やりとり | Discord Bot `/chat`（claude-cli / anthropic 切替） |
| ユーザ管理 | Cernere（Corpus が認証、初回アクセス時に名前・役職・学科を登録） |

施設予約は **Aedilis** が真実の源（GLAB は接続して見せるだけ）。
ユーザ参照・現在の出席状況・イベント・就活情報は GLAB 自前の SQLite（`data/corpus.db`）に持ち、Web hub と Discord Bot が
**同じ DB を WAL 共有**して双方向にやりとりする。

## 構成

```
GLAB/
├── corpus/        # submodule (LUDIARS/Corpus、 触らない)
├── plugins/       # Web hub モジュールパック
│   ├── attendance/  facility/  events/  jobs/
│   └── data.ts    # イベント / 就活の共有スキーマ + クエリ (bot と共用)
├── bot/           # Discord Bot (別プロセス、 独自 package)
│   ├── commands/  llm/  notify/
│   └── config-store.ts  # 暗号化 config (@ludiars/encrypted-config)
└── server.ts      # Corpus ランチャ
```

## セットアップ

### Web hub

```bash
git clone --recurse-submodules <this-repo>
npm install
npm --prefix corpus install
cp .env.example .env        # CERNERE_BASE_URL / AEDILIS_BASE_URL 等を埋める
npm run env:set             # Cernereで再発行したGLABのclient_id / client_secretも設定
npm run dev                 # http://localhost:5187
```

GLAB projectのcredentialは、Cernereの `server/` で
`npx tsx scripts/rotate-project-secret.ts --project glab` を実行して一度だけ取得する。

### Discord Bot

Bot の設定（token / API キー / チャンネル ID）は **暗号化 config** に保存する
（平文 JSON を置かない、AES-256-GCM）。

```bash
cd bot
npm install                 # @ludiars/encrypted-config は GitHub Packages 認証が要る
                            # （NODE_AUTH_TOKEN = read:packages 付き PAT）
npm run config-setup        # 対話で各キーを暗号化保存 → glab-bot.config.json
npm run start               # Gateway 接続 + slash command 登録 + リマインダ開始
```

暗号鍵はマシン束縛値（`glab-bot:hostname:user`）または env `GLAB_BOT_MASTER_KEY`。
`glab-bot.config.json` は gitignore 済（git 管理外）。マシンごとに `config-setup` を実行する。

## ビルド / 型チェック

```bash
npm run typecheck           # hub (server + plugins)
npm run build               # corpus-web + panels (esbuild)
npm --prefix bot run typecheck
```

詳細は [DESIGN.md](./DESIGN.md) / [CLAUDE.md](./CLAUDE.md) を参照。
