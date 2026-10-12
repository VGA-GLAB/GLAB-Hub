# Node プロセスのメモリ削減 — GLAB-Hub を指標にした設計

- 日付: 2026-10-12
- 指示: neco「おもに nodejs を使用しているプロセスのメモリ消費が大きい。本社で GLAB-Hub を動かしそれを指標に、本当に必要なパッケージか / メモリ消費が大きいもの (30MB 以上) は何かを調査。Node 本体が原因なら別案を考える。メモリキャッシュは Redis に逃がす」
- 状態: 設計 (未実装)。GLAB-Hub 本体の実測は未了 (§4)。
- 範囲: GLAB-Hub を指標兼最初の適用先とし、本社で稼働する他の Node サービスへの横展開案も含む。他リポの変更は各リポで別 PR にする。

## 1. 実測 (本社、2026-10-12)

数字は Windows の private bytes (他プロセスと共有しない確保量)。RSS (working set) は共有 DLL を含むのでこれより大きい。

### 1.1 Node 本体の下限

| 条件 | RSS | private |
|---|---|---|
| 空の Node 24 (`node -e`) | 58〜60MB | 23〜31MB |
| `--jitless` / `--max-semi-space-size=1` / `--v8-pool-size=1` / `--single-threaded-gc` | 57〜60MB | 変化なし |
| 空の Node + tsx ローダー (`--import tsx`) | 78MB (+18) | — |

**30MB 基準は Node 1 本でほぼ到達する。** V8 フラグでは下がらない。削減は「本数を減らす」「1 本に余計なものを載せない」で取る。

### 1.2 依存パッケージ単体の読み込みコスト (RSS 増分)

| パッケージ | 増分 | 所属 |
|---|---|---|
| @hono/node-server | +7.2MB | Corpus |
| zod | +5.2MB | GLAB |
| ws | +4.7MB | GLAB |
| postgres | +3.9MB | GLAB |
| dockview-core | +3.7MB | Corpus (画面用) |
| react-dom/server | +2.8MB | Corpus |
| hono | +1.3MB | Corpus |
| better-sqlite3 | +0.5MB | Corpus |
| react | +0.4MB | Corpus |

30MB を超える単体パッケージは無い。

### 1.3 稼働中サービスのプロセスツリー (Excubitor 管理分)

| service | 合計 | 内訳 |
|---|---|---|
| anatomia | 749MB | node 1 本 |
| concordia | 465MB | node 1 本 |
| memoria-server | 463MB | **tsx 親 56 + 子 node 346 + esbuild.exe 61** |
| actio | 430MB | node 1 本 |
| interpres | 356MB | ネイティブ exe (Node 外) |
| revisor | 350MB | node 1 本 |
| ludellus-server | 210MB | **npm 59 + cmd 5 + tsx 親 59 + 子 node 87** (`tsx watch`) |
| ludellus-web | 135MB | **npm 59 + cmd 4 + node 72** |
| concordia-cost | 124MB | node 1 本 |
| actio-web | 117MB | `vite preview` (静的配信だけ) |
| praeforma | 109MB | node 1 本 (`--import tsx`) |
| concordia-control | 99MB | node 1 本 |
| breviarium | 83MB | node 1 本 |
| aestimator | 76MB | node 1 本 |
| ludellus-mine | 30MB | node 1 本 |

Node プロセス全体 (Lictor・ツール含む) は 31 本・private 合計約 4.7GB、うち 30 本が 30MB 以上。

### 1.4 GLAB-Hub の起動形

catalog は `command: node --run start` → `start: tsx server.ts`。アプリ (Corpus を in-process で含む) は 1 本だが、tsx CLI は**親 Node が子 Node を起動して中継する**ため、memoria-server と同じく **Node 2 本 + esbuild.exe** になる。tsx 起動の上乗せは 1 サービスあたり約 135MB (親 56 + ローダー 18 + esbuild 61)。

## 2. 判定

1. 30MB を超えるパッケージは無い。原因は **Node 本体の固定費 × 本数**、**起動形の上乗せ (tsx / npm)**、一部サービスの**アプリ側ヒープ** (anatomia / concordia / actio / revisor / memoria) の 3 つ。
2. Node 本体が原因の部分は、ランタイム置き換えより「本数を減らす・上乗せを外す」が確実で安い。Bun / Deno は本社に未導入で比較していない。

## 3. 対策

### A. 起動形の正規化 (Node を「アプリ 1 本」にする) — 最優先

| 対象 | 変更 | 見込み削減 |
|---|---|---|
| GLAB-Hub | `build` に server の esbuild 変換を足し、`start` を `node dist/server.js` に。catalog の `command: node --run start` は維持 | 約 135MB |
| memoria-server | 同上 (tsx CLI → 事前変換 JS) | 約 135MB |
| ludellus-server | `npm run dev` + `tsx watch` → 事前変換 JS を `node` で直接起動 | 約 140MB |
| ludellus-web | `npm run serve` → `node scripts/serve-renderer.mjs` を直接起動 | 約 63MB |
| praeforma | `--import tsx` → 事前変換 JS | 約 18MB |
| actio-web | `vite preview` → actio 本体か軽量静的サーバで `dist/` を配信 | 約 100MB |

共通規則 (neco 決定 2026-10-12「tsx の監視はほぼ意味ないので不要。事前コンパイルして JS のみで起動。他も同じルール」):
**常駐サービスは事前コンパイルした JS を `node <js>` で直接起動する。** Excubitor の `command` に tsx / `tsx watch` / npm / `node --run` を使わず、ビルドは `build_command` で起動前に行う。`node --run` も node(--run) → cmd.exe → node の 3 段になり常駐 node が 1 本余分に残る (実測)。tsx はテストと一回限りの CLI だけで使う。GLAB-Hub が最初の適用先 (hub + bot)。

GLAB-Hub での注意: plugins は `corpus/server/hub/sdk.ts` を経由して hono を 1 本に固定している。server の esbuild 変換でこの単一ロードを壊さないこと (bundle するなら hono を 1 コピーに、しないなら `--packages=external`)。

### B. 小さいサービスの統合 — A の後に判断

Node 1 本の固定費 (private 25〜30MB、RSS 60MB) を消すには本数を減らすしかない。候補は aestimator / breviarium / ludellus-mine など常時負荷の小さいもの。concordia-control / concordia-cost は障害分離のために意図的に分けているので、統合は neco 判断。

### C. アプリ側ヒープの大きいサービス — 計測してから Redis へ

anatomia 749 / concordia 465 / actio 430 / memoria 346 / revisor 350MB は Node の固定費では説明できない。各サービスで heap snapshot (`--heapsnapshot-signal` か inspector) を取り、保持量の上位を特定してから、**TTL 付きのキャッシュに当たるものだけ** Redis に移す。永続データの全件読み込み (例: Revisor の reviewReport 一覧) は Redis ではなく SQL 側で絞る。

キャッシュ基盤は本社に置く Garnet に決定 (neco 2026-10-12、§6)。

### D. GLAB-Hub 固有

- `@simplewebauthn/browser` はブラウザ側 (`plugins/attendance/panel.ts`) 専用。esbuild でバンドルするので `devDependencies` へ移す。
- `tsx` は A の後は実行時に不要 → `devDependencies` へ (テスト・typecheck 用に残す)。
- GLAB のメモリ上キャッシュは小さい (GitHub 応答の Map、サービス token 1 件、イベントの Map)。Redis クライアントを足すと数 MB 増えるので、**GLAB は Redis に移さない**。代わりに `plugins/projects/github-client.ts` の Map に件数上限を付ける (現状は TTL だけで上限なし)。

## 4. 未了・前提

- GLAB-Hub 本体 (`glab-test`) の実測は未了。`cernere-test` が Vault の `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_REDIRECT_URI` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` を受け取れず起動直後に落ちる (Excubitor の表示は running のまま)。neco が Vault を設定したら glab-test を Excubitor で起動し、A の前後でプロセスツリーを測る。
- `qrcode` 未インストール (odeum の静的 import で起動時に落ちる) は 2026-10-12 に本体フォルダで `npm install` 済み (lock 変更なし)。

## 5. 進め方

1. A と D を GLAB-Hub に入れ、glab-test で前後比較する (指標)。A は VGA-GLAB/GLAB-Hub #2734 でマージ済み。
2. 効果を確認したら memoria-server / ludellus-server / ludellus-web / praeforma / actio-web へ横展開する (各リポ 1 PR)。**横展開は GLAB 実測の後** (neco 2026-10-12)。
3. C は heap snapshot の結果を見てからサービスごとに設計する。移し先は §6 の Garnet。
4. B は A・C の後に残った本数を見て neco が判断する。

## 6. キャッシュ基盤: 本社に Garnet を置く (neco 選定 2026-10-12)

neco「Redis は本社に置きます。Redis より良い Windows で動くキャッシュマネージャがあればそれを使用します」→ 候補 (Garnet / Memurai / 公式 Redis を WSL2・Docker) から Garnet を選定。

### 6.1 現状

- 共有 Redis は Mac (kaoimac) の OrbStack 上の docker `infra-redis-1` (Tailscale IP にバインド)。`--requirepass` 無しで、到達できること自体が権限になっている。
- 2026-10-11 に OrbStack 停止で redis / postgres が Exited のまま残り、Actio が連鎖停止した (RestartPolicy=no だった)。
- 本社 Windows の Excubitor catalog に redis / garnet は無い。

### 6.2 Garnet を選ぶ理由

| 観点 | Garnet | Memurai | 公式 Redis (WSL2 / Docker) |
|---|---|---|---|
| Windows ネイティブ | ○ (.NET、自己完結バイナリ) | ○ | × (VM / コンテナ経由) |
| ライセンス | MIT | 本番は有償 | BSD 系 (7.4 以降は別ライセンス) |
| クライアント互換 | RESP。ioredis がそのまま使える | RESP | 本家 |
| Excubitor 管理 | native exe として起動・停止・health を持てる | 同左 (Windows サービス前提) | WSL / Docker の寿命に依存 (OrbStack 事故と同型) |

Docker / VM の寿命に引きずられないこと (6.1 の事故) と、Excubitor 1 本で管理できることが決め手。

### 6.3 配置設計

- **管理**: Excubitor catalog の native サービス `garnet` (本社のみ)。起動・停止・再起動は Excubitor 経由。autostart あり、`health: tcp`。
- **所有リポ**: 共有インフラなので LUDIARS/Infra に catalog 断片とセットアップスクリプトを置く (service-bootstrap の契約に合わせ、バイナリ取得・設定生成は所有側の setup スクリプトで行う)。バイナリ自体はリポに入れない。
- **接続先の配布**: `provides: GARNET_URL` で依存サービスへ配る。各サービスの env 名は `GARNET_URL` に統一し、自前の `REDIS_URL` と衝突させない (Excubitor の topology env 名衝突の既知事例)。
- **ネットワーク**: 127.0.0.1 と本社の Tailscale IP だけにバインド。**パスワード必須** (Ex Vault に置き、`GARNET_URL` に含めて注入)。現状 Redis の「到達＝権限」をここで解消する。
- **名前空間**: DB 番号 (`SELECT n`) ではなく **キー接頭辞 `<service code>:`** で分ける。Garnet の複数 DB 対応は版によって差があるため、接頭辞方式なら依存しない。
- **用途の限定**: TTL 付きキャッシュだけを置く (§3-C)。正本データ・キュー・永続状態は置かない。消えても再計算できるものに限る。
- **メモリ上限**: Garnet 自身のメモリ量 (ログ領域・インデックス) を起動引数で固定し、本社の空きに合わせる。初期値は計測して決める (6.5)。

### 6.4 クライアント側の規約

- ioredis を使い、接続失敗時はキャッシュ無しで動く (キャッシュは劣化許容。起動を止めない)。
- キーは `<service code>:<用途>:<id>`、必ず TTL を付ける (TTL 無しの SET を禁止)。
- 1 値は小さく (目安 1MB 以下)。大きな一覧 (例: reviewReport 全件) は Garnet に入れず SQL で絞る。

### 6.5 未検証 (導入時に確かめる)

本設計の Garnet の性質は公開情報からの理解で、本社ではまだ動かしていない。導入時に次を実測・確認する。

- 対応している最新の版と Windows 用の配布形態 (自己完結 exe か .NET ランタイム要か)。
- 既定ポートと、bind / パスワード / メモリ量を指定する起動引数の正確な名前。
- 空の状態と負荷時の Garnet 自身の常駐メモリ (.NET のため Node 1 本より大きい可能性)。
- ioredis から使う予定のコマンド (GET/SET EX/DEL/MGET/SCAN など) と、TTL・接頭辞 SCAN の互換。
- Excubitor の native サービスとしての停止 (graceful) と、pid が実体を指すか。

### 6.6 進め方

1. LUDIARS/Infra に Garnet の setup スクリプト (版固定のバイナリ取得 + 設定生成) と catalog 断片を作る。バイナリの取得 (外部ダウンロード) は実行前に neco の許可を取る。
2. 本社で Excubitor から起動し、6.5 を実測して起動引数とメモリ上限を確定する。
3. §3-C の heap snapshot で「TTL キャッシュ」と判定したものから、サービスごとに Garnet へ移す (各リポ 1 PR)。
4. Mac の共有 Redis を使っているサービス (Cernere ほか) の移行は、本社 Garnet が安定してから別途判断する。
