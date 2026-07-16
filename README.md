# GLAB

学校組織 **GLAB**（Vantan Game Academy のゲーム制作ラボ）の運営 hub。
[Corpus](https://github.com/LUDIARS/Corpus)（汎用 hub フレームワーク）を submodule で取り込み、
GLAB 特化のプラグインパックと Discord Bot を載せた派生 hub。

## 機能

| 機能 | 実現方法 |
|---|---|
| 集会出席管理 | 進行中イベント + Os passkey検証後に、イベント名で出席表示 |
| 施設予約 | 独立した施設予約パネルからAedilisの施設・予約を操作 |
| イベント通知 | Web hubで施設名/ID・時間をGLABへ登録し、Discord Bot `/event list` + 定期リマインド（GLAB PostgreSQL共有） |
| 就活情報の投稿 | Discord Bot `/job` + 締切リマインド（自前 DB、Web hub `jobs` と共有） |
| 志望・内定企業 | Web hub `tirocinium` → Trの企業マスタを検索し、Cernere IDごとの志望企業・内定情報を登録 |
| レビュー | Web hub `volputas` → Volputasの設問を「ゲームレビュー」「ゲームアンケート」「ほかの人への質問」の3タブでCorpus表示 |
| ステータス | 接続サービス（Cr / Ae / Vo / Di / Tr / Os）のhealthとバージョンを集約 |
| Di | Web hub `di` → 「議論」「学習ビュー」のみを公開。議論開始時にCernere IDを監査用に関連付け |
| LLM やりとり | Discord Bot `/chat`（claude-cli / anthropic 切替） |
| ユーザ管理 | Cernere（Corpus が認証、初回アクセス時に名前・役職・学科を登録） |

施設予約は **Aedilis**、イベントは **GLAB PostgreSQL** が真実の源で、両機能は独立する。
Web hubとDiscord Botは同じイベントストアを利用する。Cernere `user_id`参照と現在の
出席状況、Botの求人投稿はGLAB SQLiteに保持する。在校生/OBの就活データとアンケート回答は
**Cernere共有schema**、企業マスタと設問はそれぞれTr / Volputasを正本とする。

## 構成

```
GLAB/
├── corpus/        # submodule (LUDIARS/Corpus、 触らない)
├── plugins/       # Web hub モジュールパック
│   ├── attendance/  facility/  events/  jobs/  tirocinium/  volputas/
│   └── data.ts    # 出席・Bot求人等のSQLiteスキーマ
├── bot/           # Discord Bot (別プロセス、 独自 package)
│   ├── commands/  llm/  notify/
│   └── config-store.ts  # 暗号化 config (@ludiars/encrypted-config)
└── server.ts      # Corpus ランチャ
```

## セットアップ

### Web hub

通常運用では **Excubitor (Ex) から起動する**。ExはGLABをspawnするたびに新しい
`CERNERE_PROJECT_CLIENT_SECRET`を生成し、Cernereへ登録してから子プロセスenvへ直接渡す。
GLAB用secretをInfisicalや`.env`へ固定保存しない。

1. ExのLaunch画面で`glab`を選択する（`cernere` / `corpus` / `volputas`は依存として先に起動）。
2. ExのpreflightでCernere接続とExcubitor issuer credentialを確認する。
3. Startを実行する。GLABは `http://localhost:5187` で起動する。

単独開発時だけ従来の`.env` / env-cli経路を利用できる。

```bash
git clone --recurse-submodules <this-repo>
npm install
npm --prefix corpus install
cp .env.example .env
npm run dev
```

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
