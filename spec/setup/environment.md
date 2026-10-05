# setup/ — 環境変数・シークレット一覧

GLAB は 2 系統の設定を持つ：**hub** は開発時も Excubitor の Vault-only spawn env、**Bot** は暗号化 config
（[`bot-encrypted-config.md`](./bot-encrypted-config.md)）。token / API キーは平文 JSON に置かない。

## Web hub（Excubitor spawn env）

| 変数 | 既定 | 必須（production） | 意味 |
|---|---|---|---|
| `CERNERE_BASE_URL` | `http://localhost:8080` | ○ | Cernere 認証（PASETO V4） |
| `CERNERE_PROJECT_CLIENT_ID` | （空） | ○ | Cernereが起動時発行したGLAB client ID（Ex注入） |
| `CERNERE_PROJECT_CLIENT_SECRET` | （空） | ○ | Exが起動ごとに生成したsecret（固定保存せず子envのみ） |
| `CERNERE_FACE_PHOTO_TOKEN` | （空） | — | 名簿・出席確認画面で顔写真を表示するための Cernere tool client token（scope `face-photo:read`）。未設定なら他人の写真は取得せず 503 を返す（fail closed）。Cernere は project token を写真経路で拒否するため、この token は project 資格情報とは別に発行する |
| `CORPUS_PUBLIC_URL` | `http://localhost:5187` | ○ | 自身の public URL（PASETO audience） |
| `CORPUS_ADMIN_IDS` | （空） | ○ | Cernereが返すadmin user ID（Exがカンマ区切りで注入） |
| `CORPUS_PORT` | `5187` | | listen port（VantanHub 5186 の次） |
| `CORPUS_MODE` | `server` | | Corpus 動作モード |
| `CORPUS_TOKEN_MODE` | `cernere-project-token` | | 接続先ごとの短命 Cernere project token を発行 |
| `CORPUS_SERVICE_ID` | `EducationLab` | | サービス識別（マニフェスト / Cernere project key）。`excubitor.catalog.yaml` の `cernere_launch_credentials.target_project` と一致させる |
| `CORPUS_DISPLAY_NAME` | `GLab-Hub` | | サービス表示名（マニフェスト / 自己コネクタ） |
| `CORPUS_SERVICE_VERSION` | GLAB package version | | GLAB `/api/health` と概況へ出すバージョン |
| `GLAB_DATABASE_URL` | `postgresql://glab_user:glab@localhost:5432/glab` | ○ | GLAB所有イベント・施設マスタをWeb/Botで共有するPostgreSQL URL。既定はExcubitor catalog断片の`env:`が注入するlocalhost開発DB（LUDIARS/infraの`init-databases.sql`が作る）。ローカル以外へ置く場合はExcubitor Vault 注入で上書きする |
| `AEDILIS_BASE_URL` | （空 = degraded） | | 施設予約の集約先 Aedilis |
| `OSTIARIUS_URL` | （空 = 出席無効） | | GLabサーバーからOsへ到達する内部URL。OsはTunnelへ公開しない。ブラウザ向けURLはOs healthの `lanUrl` のみを使い、会場Wi-Fiから直接healthへ到達できた場合だけ出席を表示 |
| `VOLPUTAS_URL` | （空 = degraded） | | Volputas API / health の base URL（Ex topology は `http://localhost:8892` を注入） |
| `DISCUTERE_URL` | （空 = degraded） | | Di API の内部 base URL（Ex topology は `http://localhost:3110` を注入） |
| `DISCUTERE_WEB_URL` | `DISCUTERE_URL` | | Di Web UI が API と別 origin の場合の public base URL |
| `TIROCINIUM_URL` | （空 = degraded） | | Tr API の内部 base URL（Ex topology は `http://localhost:8084` を注入） |
| `CALLIOPE_BASE_URL` | （空 = degraded） | | PM進捗の集約先 Calliope。`GET /api/glab/progress` を read するだけ（[`interface/calliope-connector.md`](../interface/calliope-connector.md)） |
| `CALLIOPE_PROJECT_KEY` | （空 = service token を発行しない）。catalog は `calliope` | | Calliope の Cernere managed project key（Cernere migration 058 で登録）。GLAB の project credentials で scope `calliope-api:access` の Cernere service token を発行する宛先（認証集約 P4） |
| `CALLIOPE_SERVICE_TOKEN` | （空） | | Calliope `/api/*` の従来の固定 Bearer。P4 の間は service token 発行失敗時だけ使う（P5 で撤去）。service token も固定トークンも無ければ data 取得は 503。平文保存せずExcubitor Vault / spawn envから注入 |
| `GLAB_PROJECTS_SERVICE_TOKEN` | （空） | | `/external/*`（projects / consult / tech-links）の従来の固定トークン。P4 の間は Cernere service token（scope `glab-external:write`）と両受理。どちらも無ければ 503（P5 で撤去） |
| `GLAB_SERVICE_TOKEN_AUDIENCE` | `educationlab` | | 受信する Cernere service token の `aud`（= Cernere 上の GLAB `EducationLab` の storage_slug）。Cernere の実値と異なる場合だけ catalog `env:` で上書きする |
| `CORPUS_EXTERNAL_SERVICE_AUTH_MODULES` | （空 = 無効）。catalog は `consult,projects` | | Corpus requireAuth が Cernere service token を service 主体として通すモジュール。対象は `/api/x/<module>/external/*` だけ（Corpus #2460、認証集約 P4）。bot の相談通知巡回と Calliope の projects 参照がユーザ token 無しで plugin の認可に届く |
| `CORPUS_EXTERNAL_SERVICE_TOKEN_HEADERS` | （Authorization のみ）。catalog は `x-glab-service-token,x-projecthub-service-token` | | 上記で service token を探すヘッダ名 |
| `CORPUS_CERNERE_STORAGE_SLUG` | — | 上記を有効化したとき | Corpus が照合する service token の `aud`。`GLAB_SERVICE_TOKEN_AUDIENCE` と同じ値（`educationlab`） |
| `GLAB_GITHUB_TOKEN` | （空 = 未認証アクセス） | | GitHub public API の rate-limit 緩和にだけ使う read 用 token。接続先は `https://api.github.com` 固定で、未設定でも同期は動く |
| `GLAB_OMNIPOTENS_REVIEW_ROOT` | （空 = 解析閲覧無効） | | Omnipotentsの`Review`フォルダ。`Review/<project name>/report`を登録済みリポジトリ名からだけ参照し、任意パス、worktree、シンボリックリンクは受け付けない |

ExはCernereの`POST /api/auth/project-launch-credential`をspawn直前に呼ぶ。Exが生成した
secretはCernereで暗号化永続化され、GLAB子プロセスenvへだけ渡る。旧secretは次回起動時に
無効化される。発行失敗や必須env不足時はExがspawnを中止し、初回登録を迂回しない。

GLABはCernere frontendを起動依存に持たない。Corpusがproject credentialでCernere backendへ
直接接続し、ユーザーセッションはGLAB originのHttpOnly access/refresh Cookieで継続する。

Hub は `.env` / `.env.secrets` を読み込まない。非 secret のパス・フラグ・ID は catalog の `env:`、secret は Ex Vault へ登録してサービスへ紐付ける。
注入の優先順位は topology < catalog env < 暗号化 runtime config < Vault。
`server.ts` は DB 初期化より前に `CERNERE_BASE_URL`、`CERNERE_PROJECT_CLIENT_ID`、
`CERNERE_PROJECT_CLIENT_SECRET`、`CORPUS_PUBLIC_URL`、`CORPUS_TOKEN_MODE`、`GLAB_DATABASE_URL` を検証する。
不足時はキー名だけを示して停止し、secret の再取得や旧設定へのフォールバックは行わない。
Corpus standalone bootstrap の CLI 引数による env 上書きは GLAB では適用しない。

## Discord Bot（暗号化 config or env、`bot/config.ts`）

| 変数 | 既定 | 暗号化 | 意味 |
|---|---|---|---|
| `DISCORD_TOKEN` | — | ○ | Bot トークン（必須、未設定で起動中止） |
| `DISCORD_CLIENT_ID` | — | | アプリ（client）ID（既存 command の空同期に必要） |
| `DISCORD_GUILD_ID` | — | | 空同期する guild。global は常に空同期し、設定時はこの guild も空にする |
| `GLAB_DB_PATH` | `bot/../data/corpus.db` | | 出席・Bot求人等の共有SQLite |
| `GLAB_DATABASE_URL` | — | ○ | Web hubと共通のGLABイベントPostgreSQL。`npm run config-setup`で暗号化configに保存（env指定も可） |
| `GLAB_EVENT_CHANNEL_ID` | — | | イベント通知先 |
| `GLAB_JOB_CHANNEL_ID` | — | | 就活通知先 |
| `GLAB_DAILY_CHANNEL_ID` | `GLAB_EVENT_CHANNEL_ID` | | 5分クエストとスポットライトの日次通知先 |
| `GLAB_DAILY_NOTIFY_AT` | `09:00` | | 日次通知時刻（Asia/Tokyo の `HH:MM`） |
| `GLAB_ADMIN_USER_IDS` | — | | 旧 command の互換設定。現行通知 runtime は未使用 |
| `GLAB_LLM_*`, `ANTHROPIC_*`, `CLAUDE_CODE_GIT_BASH_PATH` | — | | 旧 `/chat` 部品の互換設定。現行通知 runtime は LLM を初期化しない |
| `GLAB_REMINDER_INTERVAL_MS` | `300000` | | スケジューラ周期 |
| `GLAB_EVENT_WINDOW_MS` | `86400000`（24h） | | イベントリマインド窓 |
| `GLAB_JOB_WINDOW_MS` | `259200000`（3 日） | | 就活締切リマインド窓 |
| `GLAB_BOT_MASTER_KEY` | （マシン束縛値） | | 暗号化 config の master 鍵 |
| `GLAB_BOT_CONFIG_PATH` | `bot/glab-bot.config.json` | | 暗号化 config の保存先 |
| `CERNERE_BASE_URL` / `CERNERE_PROJECT_CLIENT_ID` / `CERNERE_PROJECT_CLIENT_SECRET` | — | | hub の external API へ送る Cernere service token（scope `glab-external:write`）の取得に使う。Excubitor の catalog `glab-bot` が bot 専用の Cernere project `glab-bot`（Cernere migration 059）の launch credential を起動ごとに注入する。hub（EducationLab）の credential は共有しない |

## gitignore（`.gitignore`）

`data/`, `logs/`, `.env`, `.env.secrets`, `.env.local`, `plugins/*/panel.js(.map)`,
`bot/glab-bot.config.json` は git 管理外。secret / 生成物はコミットしない。

## デプロイ / リリース

v0.1 はExからhubを起動し、Botは`npm run start`で別プロセス運用する。専用のデプロイ
パイプラインは未整備。hub設定はExのspawn env、Bot設定はマシンごとの
`config-setup` で揃える。

## 関連

- hub: [`setup/hub.md`](./hub.md) / Bot: [`setup/bot-encrypted-config.md`](./bot-encrypted-config.md)
- 別マシンでの立ち上げ: [`setup/new-machine.md`](./new-machine.md)
