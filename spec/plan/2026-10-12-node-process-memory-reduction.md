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

共通規則: 「Excubitor の `command` は `node <js>` か `node --run <script>` で、script 内も tsx / npm を挟まない」。Excubitor の breakaway で npm を避けた既存理由 (pid が実体を指さない) とも一致する。

GLAB-Hub での注意: plugins は `corpus/server/hub/sdk.ts` を経由して hono を 1 本に固定している。server の esbuild 変換でこの単一ロードを壊さないこと (bundle するなら hono を 1 コピーに、しないなら `--packages=external`)。

### B. 小さいサービスの統合 — A の後に判断

Node 1 本の固定費 (private 25〜30MB、RSS 60MB) を消すには本数を減らすしかない。候補は aestimator / breviarium / ludellus-mine など常時負荷の小さいもの。concordia-control / concordia-cost は障害分離のために意図的に分けているので、統合は neco 判断。

### C. アプリ側ヒープの大きいサービス — 計測してから Redis へ

anatomia 749 / concordia 465 / actio 430 / memoria 346 / revisor 350MB は Node の固定費では説明できない。各サービスで heap snapshot (`--heapsnapshot-signal` か inspector) を取り、保持量の上位を特定してから、**TTL 付きのキャッシュに当たるものだけ** Redis に移す。永続データの全件読み込み (例: Revisor の reviewReport 一覧) は Redis ではなく SQL 側で絞る。

Redis の置き場所 (Cernere 用 Redis の共用可否。本社 Excubitor catalog に redis は未登録) を決める必要がある。

### D. GLAB-Hub 固有

- `@simplewebauthn/browser` はブラウザ側 (`plugins/attendance/panel.ts`) 専用。esbuild でバンドルするので `devDependencies` へ移す。
- `tsx` は A の後は実行時に不要 → `devDependencies` へ (テスト・typecheck 用に残す)。
- GLAB のメモリ上キャッシュは小さい (GitHub 応答の Map、サービス token 1 件、イベントの Map)。Redis クライアントを足すと数 MB 増えるので、**GLAB は Redis に移さない**。代わりに `plugins/projects/github-client.ts` の Map に件数上限を付ける (現状は TTL だけで上限なし)。

## 4. 未了・前提

- GLAB-Hub 本体 (`glab-test`) の実測は未了。`cernere-test` が Vault の `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_REDIRECT_URI` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` を受け取れず起動直後に落ちる (Excubitor の表示は running のまま)。neco が Vault を設定したら glab-test を Excubitor で起動し、A の前後でプロセスツリーを測る。
- `qrcode` 未インストール (odeum の静的 import で起動時に落ちる) は 2026-10-12 に本体フォルダで `npm install` 済み (lock 変更なし)。

## 5. 進め方

1. A と D を GLAB-Hub に入れ、glab-test で前後比較する (指標)。
2. 効果を確認したら memoria-server / ludellus-server / ludellus-web / praeforma / actio-web へ横展開する (各リポ 1 PR)。
3. C は heap snapshot の結果を見てからサービスごとに設計する。
4. B は A・C の後に残った本数を見て neco が判断する。
