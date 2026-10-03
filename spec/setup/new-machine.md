# setup/ — 別マシンで GLab スタックを立てる

既に動いているマシンから **別の環境へ移す / 二台目を立てる** ときの手順。
GLab 単体の env は [`environment.md`](./environment.md)、Bot の暗号化 config は
[`bot-encrypted-config.md`](./bot-encrypted-config.md)、Web hub の起動は
[`hub.md`](./hub.md) が正本。ここは **それらの外側** — catalog の非 secret 設定、
マシンに束縛された暗号化ストア、Excubitor 側の前提 — を扱う。

> 2026-10-04: Vault-only 運用へ更新。§2 の catalog 信頼設定と §3 の Vault 紐付けを確認する。

---

## 0. 順序

前段が終わらないと次が動かない。飛ばさないこと。

1. インフラ (Postgres / Redis) を上げる → §1
2. Excubitor の環境変数を設定する → §2
3. Excubitor の暗号化 config を復旧または再入力する → §3
4. Excubitor を OS サービスとして登録・起動する → §4
5. Cernere を起動する → §5
6. GLab bot の暗号化 config を入れる → §6
7. GLab を起動する → §7

---

## 1. インフラ

workspace root (`EXCUBITOR_ARS_ROOT`) 直下の `infra/docker-compose.yaml`
(postgres / redis / minio / mailpit)。**GLab リポジトリの中ではない。**
同梱の `init-databases.sql` が `cernere` / `glab` / `volputas` / `excubitor` などの DB を作る。

**先にこれを上げないと以降が全部落ちる。** Postgres 5432 / Redis 6379。

---

## 2. Excubitor の環境変数 (User 環境変数)

```
EXCUBITOR_ARS_ROOT=<workspace root>          例 E:/Document/Ars
EXCUBITOR_TRUSTED_FRAGMENT_REPOS=GLAB
```

**両方必須。片方でも欠けると GLab の catalog 定義が丸ごと捨てられる。**

理由 (Excubitor `src/catalog/loader.ts`):

- 断片 (`<repo>/excubitor.catalog.yaml`) が `requires_secret` /
  `cernere_launch_credentials` のいずれかを持つ場合、**信頼されていない断片は
  そのサービス定義ごと破棄される**。
- 走査ルートが信頼境界になるのは `EXCUBITOR_ARS_ROOT` を**明示設定したときだけ**。
  cwd の親という暗黙 fallback は信頼境界にしない設計。
- GLAB の origin owner は `VGA-GLAB` で、自動信頼される `ludiars` に該当しないため
  `EXCUBITOR_TRUSTED_FRAGMENT_REPOS` への明示列挙が要る。

**症状**: 設定漏れのまま起動すると、GLab は scanner が拾った古い自動定義で動こうとし、
`hot reload is disabled for service glab` で起動に失敗する (断片側の
`allow_hot_reload: true` も port 5187 も env も全部届いていない)。

**確認**:

```bash
curl -s http://127.0.0.1:17332/api/v1/services/glab
# catalog_snapshot.port が 5187、allow_hot_reload が true、
# depends_on と requires_secret が入っていれば断片が読まれている
```

> **反映には supervisor と backend の両方の再起動が要る。** supervisor だけ再起動しても
> reconcile が旧 env のまま生きている backend を再採用するため、catalog を解決する
> プロセスの env が古いままになる。

---

## 3. 暗号化 config はマシンに束縛されている (最大の落とし穴)

`config.enc` をコピーしても、既定では**別マシンで復号できない**。

| ストア | 場所 | master 鍵 |
|---|---|---|
| Excubitor | `%APPDATA%/Excubitor/config.enc` | `EXCUBITOR_MASTER_KEY` → 無ければ `excubitor:<hostname>:<username>` |
| GLab bot | `bot/glab-bot.config.json` (`GLAB_BOT_CONFIG_PATH` で上書き) | `GLAB_BOT_MASTER_KEY` → 無ければ `glab-bot:<hostname>:<user>` |

master 鍵が変われば既存の暗号化データは復号できなくなるため、選択肢は 2 つ:

- **A. 持ち運ぶ** — 両マシンで `EXCUBITOR_MASTER_KEY` / `GLAB_BOT_MASTER_KEY` を
  同じ値に明示設定し、config ファイルをコピーする
- **B. 入れ直す** — 新マシンで Excubitor WebUI / bot の config-setup から再入力する

**Vault-only の確認**:

- Ex の管理画面で GLAB の Vault secret 紐付けと必須キーの充足を確認する。値をログへ出さない。
- 非 secret の設定はサービス所有 catalog の `env:`、secret は Vault で管理する。
- Cernere 起動 credential は Ex が spawn ごとに発行する。GLAB が secret を取得する設定は不要。
- Vault の移設・復旧は Ex の現行手順に従う。旧 machine identity / env-cli の復旧手順は使わない。

---

## 4. Excubitor の起動

Excubitor リポジトリ側で:

```bash
npm install
npm --prefix frontend install
npm run build
npm --prefix frontend run build
```

OS サービス (Windows は Scheduled Task) として登録する。supervisor は
`dist/service-runner.js` を直接 main process として起動する。

**`excubitorctl excubitor restart` は backend を再起動するだけで supervisor は入れ替わらない。**
supervisor 自体を更新するときは Scheduled Task を stop → start する。

> job-breakaway spawn が効いていれば、supervisor を落としても稼働中サービスは道連れに
> ならず、再起動後に reconcile が生存 pid を再採用する。

---

## 5. Cernere (catalog / Vault 注入設定)

| キー | 既定 | 備考 |
|---|---|---|
| `DATABASE_URL` | `postgres://cernere:cernere@localhost:5432/cernere` | |
| `REDIS_URL` | `redis://127.0.0.1:6379` | |
| `LISTEN_PORT` | `8080` | |
| `FRONTEND_URL` | `http://localhost:5173` | CORS / WebAuthn origin の基準 |
| `CERNERE_PUBLIC_URL` | LISTEN_PORT から生成 | 逆プロキシ配下では公開ホスト名 |
| `JWT_SECRET` | — | |
| `CERNERE_SECRET_KEY` | — | AES-256-GCM の復号鍵。OIDC 署名鍵を DB に持つ場合も必須 |
| `CERNERE_OIDC_MODE` | `auto` | **GLab 用途なら `off`**。GLab は Cernere 認証だけで完結し OIDC Provider を使わない |

PASETO 鍵 (`CERNERE_PASETO_SECRET_KEY` / `_PUBLIC_KEY` / `_KID`) は Excubitor Vault 側。
**未設定だと `/api/auth/project-token` が 500 になり、GLab のログインが通らない。**
`GET /.well-known/cernere-public-key` が 1 件以上返れば有効。

---

## 6. GLab bot

Discord アプリは **1 つで bot と OAuth を兼ねられる**。bot には
**Manage Channels / Manage Threads** 権限を付けておく (フォーラム操作で使う)。

キーは [`bot-encrypted-config.md`](./bot-encrypted-config.md) を参照。
**`DISCORD_TOKEN` だけは必須** — 未設定だと `bot/index.ts` が起動時に exit する。
チャンネル ID や LLM 系のキーは未設定でも該当機能が無効になるだけで起動はする。

---

## 7. GLab 本体

```bash
git clone --recurse-submodules <this-repo>
git submodule update --init --recursive     # corpus submodule は必須
npm install
npm --prefix corpus install
```

起動は Excubitor 経由 (`excubitorctl service glab start`)。

**確認**:

```bash
curl -s http://127.0.0.1:5187/api/health
# {"ok":true,"service":"glab","version":"...","modules":[...]}
# modules は plugins/pack.json の modules と同数 (2026-08-04 時点で 15)
```

依存 (cernere / cernere-frontend / aedilis / tirocinium / discutere / volputas /
ostiarius) が止まっていても **GLab 自体は起動し、該当パネルが degraded になるだけ**。

---

## よくある無言の失敗

| 症状 | 原因 |
|---|---|
| `hot reload is disabled for service glab` | §2 の環境変数 2 本が未設定で断片が破棄されている |
| 必須 env 不足で起動拒否 | §3 の Vault 紐付け・復号と catalog 設定を確認する |
| `'tsx' は、内部コマンドまたは外部コマンド...として認識されていません` で無言死 | シェルの `NODE_ENV=production` により devDependencies が入っていない。**`NODE_ENV=development npm install --include=dev`** で入れ直す |
| `/api/auth/project-token` が 500 | Cernere の PASETO 鍵が未登録 (§5) |
| `attendance gateway key refresh failed` | Ostiarius 未起動。GLab の障害ではない |
