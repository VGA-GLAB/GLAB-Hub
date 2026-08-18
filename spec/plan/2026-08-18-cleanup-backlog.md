# 2026-08-18 実装 cleanup backlog (GLab-Hub)

## 1. 目的と対象

2026-07-16 の実装レビューで「cleanup 系 ~30 件が残る」と記録されたが具体リストが
失われたため、現行 main を読み直して起こし直したもの。GLab チーム目標 G4 step2
「cleanup 残を消化する」の作業単位はこの表を正本とする。

| 項目 | 値 |
|---|---|
| 対象リポジトリ | `VGA-GLAB/GLAB-Hub` |
| 対象コミット | `fb07a92a97531f9b9f5749922efdbf798a598268` (main, `fix(cernere): GLab の Cernere project key を EducationLab へ整合させる`) |
| 調査範囲 | `plugins/`, `bot/`, `public/src/`, `server.ts`, `scripts/`, `tests/`, `spec/`, `README.md`, `DESIGN.md`, `CLAUDE.md`, `.anatomia/` |
| 除外 | `corpus/` (submodule、読むだけ)、`node_modules/`、gitignore 済みビルド成果物 (`plugins/*/panel.js`, `public/app.js`) |
| この文書の性質 | docs-only。コード・spec 本文の修正は含まない |

調査手法: `git ls-files` で追跡ファイルだけを対象にし、`export` 宣言 266 件を抽出して
識別子ごとに「定義ファイル外の本番ファイルからの参照有無」「`tests/` からの参照有無」を
突き合わせた。表の `file:line` はすべて対象コミットで実在を確認した行であり、推測は含めない。

束の定義:

- **B1 = code cleanup PR** — `plugins/` / `bot/` のコード変更。`npm run typecheck` + `npm test` + `npm run build` で担保する。
- **B2 = spec cleanup PR** — `spec/` / `README.md` / `DESIGN.md` / `CLAUDE.md` / `.anatomia/` の文書変更。docs-only なので検証はレビューのみ。

---

## 2. 項目表

### 種別 A — デッドコード / 未使用 export

| # | 種別 | file:line | 内容 | 対処案 | リスク | 束 |
|---|---|---|---|---|---|---|
| A1 | 未使用 export | `bot/config-store.ts:65` | `deleteBotConfig` が定義行以外どこからも参照されない (本番 0 / `tests/` 0) | 関数ごと削除 | 破壊的でない。`deleteConfig` (`@ludiars/encrypted-config`) の import が未使用になるので併せて整理 | B1 |
| A2 | 未使用 export | `plugins/volputas/contracts.ts:124` | `parseGameDetail` が定義行以外どこからも参照されない (本番 0 / `tests/` 0)。`parseGameList` (:118) だけが `panel.ts` から使われている | 関数ごと削除 | 破壊的でない。将来の単体取得 API 用に温存する判断もあり得るので、削除時はコミットメッセージに理由を残す | B1 |
| A3 | テスト専用 export | `plugins/data.ts:421` | `setAttendanceStatus` は本番コードから参照されず `tests/glab-user-data.test.ts:72` のみ。出席の正本は `glab_attendance` (`plugins/data.ts:41`) で、`glab_user.attendance_*` は `spec/feature/attendance.md:22` が deprecated と明記済み | 関数と対応テストを削除し、列は §4 のとおり温存する。または関数コメントに deprecated を明記して残す | **列そのものは温存する**。関数削除は `glab_user` の書き込み経路が消えるだけでデータ破壊は起きない。依存元は `tests/glab-user-data.test.ts` のみ | B1 |
| A4 | 過剰 export (値) | `plugins/data.ts:144` `ATTENDANCE_STATUSES` / `plugins/data.ts:263` `DEFAULT_ROLE_DEFS` / `plugins/events/store.ts:60` `EventStore` / `plugins/events/facility-store.ts:17` `FacilityStore` / `plugins/progress/progress-view.ts:158` `renderProject` | いずれも定義ファイル内でしか使われないのに `export` されている (他の本番ファイル 0 / `tests/` 0)。`EventStore` / `FacilityStore` は消費側が `getEventStore()` / `getFacilityStore()` を使うためクラス名自体は外に出ていない | `export` を外す (関数・クラスは残す) | 破壊的でない。ただし `EventStore` / `FacilityStore` は `bot/` から将来直接使う可能性があるので、外す前に `bot/index.ts:15-16` の import 面 (`initializeEventStore` / `closeEventStore`) を確認する | B1 |
| A5 | 過剰 export (型) | 31 件。代表: `plugins/progress/progress-view.ts:9,17,25,32,40,47,54` / `plugins/projects/github-client.ts:10,11,12` / `plugins/attendance/attestation-verify.ts:3,11,17,21` / `plugins/data.ts:152,175,337,484,535,650,672,703` / `plugins/events/store.ts:29` / `plugins/volputas/contracts.ts:59,77` / `plugins/consult/presence-client.ts:5` / `plugins/cernere/project-client.ts:18` / `plugins/service-health-connector.ts:24` / `plugins/progress/connector.ts:20` / `bot/config.ts:13` / `bot/glab-api.ts:15` | 定義ファイル外の本番ファイルからも `tests/` からも参照されない型 export | 一括で `export` を外す。ただし公開契約を表す型 (`AttestationPayload`, `GitHubRelease`, `ProjectProgress` 等) は文書価値があるため個別判断 | 破壊的でない (型のみ)。件数が多いので A1〜A4 とは別コミットに分ける | B1 |

補足: 「他の本番ファイルからは参照されないが `tests/` からは参照される」export は 15 件あり
(`plugins/data.ts:14,27,154,287,410,707,780` / `plugins/events/recurrence.ts:10` /
`plugins/events/store.ts:42` / `plugins/progress/connector.ts:12,28` /
`plugins/projects/github-client.ts:37` / `plugins/service-health-connector.ts:101` /
`plugins/consult/presence-schema.ts:14` / `plugins/cernere/project-client.ts:8`)、
これらはテスト境界として意図的なものなので backlog に載せない。

### 種別 B — spec ↔ 実装の乖離

| # | 種別 | file:line | 内容 | 対処案 | リスク | 束 |
|---|---|---|---|---|---|---|
| B1 | 退役機能を現行として記述 | `spec/data/glab-user.md:16-23` | `attendance_status` を「NOT NULL / enum」の現行列として説明し、「現在状況と直近イベントだけを保持」と書く。実際の出席正本は `glab_attendance` (`plugins/data.ts:41`) で、`spec/feature/attendance.md:22` は `glab_user.attendance_*` を deprecated compatibility fields と明記している (seed S2) | `attendance_status` / `attendance_event_id` / `attendance_checked_in_at` の 3 列に「deprecated (v2P1)、正本は `glab_attendance`」を追記し、`spec/data/glab-attendance.md` へリンクする | 文書のみ。列は温存 (§4) | B2 |
| B2 | 実装と食い違う記述 | `DESIGN.md:52` | attendance の説明が「Os passkey → Aedilis `/api/checkin/verify` で attestation 検証後に」。実装は自前検証で、`plugins/attendance/index.ts:138-140` に「attestation を自前検証するので Ostiarius の health は見ない」とコメントがあり `verifyAttestation` (`plugins/attendance/attestation-verify.ts`) を直接呼ぶ。`spec/feature/attendance.md:5` も「Aedilis は出席検証に関与しない」と書く | `DESIGN.md:52` を自前検証 (Os 公開鍵を `glab_gateway` にキャッシュして Ed25519 検証) に書き換える | 文書のみ | B2 |
| B3 | 実装と食い違う記述 | `DESIGN.md:52` / `DESIGN.md:123` / `CLAUDE.md:32` | 出席の保存先を `glab_user` と書く。実際の台帳は `glab_attendance` (`plugins/data.ts:41-51`) で、`recordAttendance` (`plugins/data.ts:495`) が書く | 3 箇所とも `glab_attendance` を正本として書き換え、`glab_user` は「参照行の確保のみ」に直す | 文書のみ。B1 と同時に直さないと文書間で矛盾が残る | B2 |
| B4 | 実装と食い違う記述 | `spec/interface/aedilis-connector.md:7` | 「`user_id` と現在の出席状況は…GLAB の `glab_user` が正本」。B1/B3 と同じ乖離 | `glab_attendance` を正本として書き換える | 文書のみ | B2 |
| B5 | 記述の網羅漏れ | `DESIGN.md:49-57` | モジュール表が `attendance` / `facility` / `events` / `jobs` / `tirocinium` / `volputas` の 6 件のみ。`plugins/pack.json` の `modules` は 15 件で、`di` / `projects` / `roles` / `forum` / `consult` / `progress` / `tech-links` / `vantan-user` / `cernere-admin` が表に無い | 不足 9 モジュールの行を追加する (責務は `spec/anatomia-domains.md:29-41` の記述を流用) | 文書のみ | B2 |
| B6 | 記述の網羅漏れ | `README.md:9-21` | 機能表に `forum` / `consult` / `tech-links` / `projects` / `progress` / `roles` / `cernere-admin` が無い | 不足機能の行を追加する | 文書のみ | B2 |
| B7 | 記述の網羅漏れ | `README.md:35` | 構成ツリーの plugins 列挙が `attendance/ facility/ events/ jobs/ tirocinium/ volputas/` の 6 ディレクトリのみ。実際は 16 ディレクトリ (`plugins/cernere/` は共有クライアント置き場でモジュールではない) | 列挙を実態に合わせるか、「`pack.json` の `modules` を参照」に置き換えて二重管理をやめる | 文書のみ | B2 |
| B8 | 退役機能を現行として記述 | `spec/test/strategy.md:35` | 「`plugins/data.ts` は実 SQLite でスキーマ・単回答更新・複数回答追加・旧回答移行を検証する」。単回答 / 複数回答 / 旧回答移行はいずれも退役した survey 回答テーブルの語彙で、現行の `tests/schema-wal-idempotence.test.ts` は `ensureSchema` の冪等と `glab_job` / `glab_project` / `glab_project_member` の CRUD を検証している | この行を現行のテスト内容に書き換える | 文書のみ | B2 |

### 種別 C — 重複定義

| # | 種別 | file:line | 内容 | 対処案 | リスク | 束 |
|---|---|---|---|---|---|---|
| C1 | connector 定義の重複 | `plugins/events/index.ts:234-240` と `plugins/facility/index.ts:24-30` | 同一設定 (`id: 'aedilis'`, `title: '施設予約 (Aedilis)'`, `scope: 'multi'`, `baseUrl: AEDILIS_BASE_URL`, `healthPath: '/api/health'`) の `VersionedHttpServiceConnector` を 2 モジュールが別々に構築する。`ctx.registerConnector` するのは facility 側 (`plugins/facility/index.ts:31`) だけ (seed S1) | **重複登録バグではない**。`spec/plan/2026-07-16-review-fix-tasks.md` T1 に「setup で Aedilis connector を生成 (register は facility 側と重複するため不可)」と意図が記録されている。よって「生成の重複」だけを解消する: `plugins/service-health-connector.ts` かイベント側に `makeAedilisConnector(env)` を切り出し、両モジュールから呼ぶ (`plugins/progress/connector.ts:28` の `calliopeConnectorOptions` が先例) | 低。register の重複は起こさないよう、ファクトリは connector 生成のみを行い registerConnector は呼ばない。依存元は events / facility の 2 モジュール | B1 |
| C2 | env 読み取りの重複 | `plugins/events/index.ts:238` / `plugins/facility/index.ts:28` / `plugins/facility/index.ts:56` | `AEDILIS_BASE_URL` を 3 箇所で個別に `ctx.env()` する。`:56` は degraded 表示用のログ文言 | C1 のファクトリに集約する | 低 | B1 |
| C3 | env 読み取りの重複 | `plugins/consult/index.ts:91` / `plugins/projects/index.ts:240` / `plugins/projects/index.ts:266` / `plugins/tech-links/index.ts:177` / `plugins/tech-links/index.ts:191` / `plugins/volputas/index.ts:156` | `GLAB_PROJECTS_SERVICE_TOKEN` を 4 モジュール 6 箇所で個別に読む。すべて `requireServiceToken` (`plugins/projects/service-auth.ts:21`) へ渡すためだけ | `plugins/shared.ts` に `serviceTokenGuard(ctx)` のような 1 関数を置き、6 箇所をそれに置き換える | 低。認証ミドルウェアなので置換漏れが 401/403 の挙動差になる。`tests/service-auth.test.ts` があるので typecheck + test で担保できる | B1 |
| C4 | ヘルパの重複 | `plugins/cernere-admin/entry-points.ts:10` `normalizeCernereWebUrl` / `plugins/di/entry-points.ts:6` `normalizeDiBaseUrl` / `plugins/volputas/entry-points.ts:1` `normalizeHttpBaseUrl` | 3 関数の本体がほぼ同一 (trim → `new URL` → http/https 判定 → credentials/query/fragment 拒否 → 末尾スラッシュ正規化)。差は protocol 判定の書き方 (`['http:','https:'].includes` か `!==` の 2 連) だけ | `plugins/shared.ts` に 1 本化し、3 モジュールから呼ぶ | 低。`tests/di-entry-points.test.ts` / `tests/volputas-entry-points.test.ts` が既存の振る舞いを固定しているので回帰を検出できる | B1 |

### 種別 D — テスト未カバー

`plugins/data.ts` の `glab_*` は 17 テーブル。`tests/schema-wal-idempotence.test.ts:40-56` が
全 17 テーブルの「存在」を 2 接続から確認済みで、CRUD は `glab_job` (:137) と
`glab_project` / `glab_project_member` (:153) だけが実 SQLite で検証されている。
以下は CRUD 検証が無いもの (`glab_user` / `glab_project_release` / `glab_review_relay` /
`glab_tech_link` / `glab_attendance` / `glab_attendance_nonce` は他テストで担保済みのため除外)。

| # | 種別 | file:line | 内容 | 対処案 | リスク | 束 |
|---|---|---|---|---|---|---|
| D1 | テスト未カバー | `plugins/data.ts:453` `saveGateway` / `plugins/data.ts:464` `findGateway` | `glab_gateway` の upsert と参照が `tests/` で実行されない。参照は `tests/schema-wal-idempotence.test.ts:42` のテーブル存在確認のみ | `tests/attendance-ledger-data.test.ts` に upsert 冪等 (`lan_id` PK の二度目) のケースを足す | 低 (テスト追加のみ) | B1 |
| D2 | テスト未カバー | `plugins/consult/index.ts:41-53` ほか | `glab_consult` の SQL がすべて route ハンドラ内インラインで、`tests/consult-contract.test.ts` は接続契約のみ。テーブルへの INSERT/SELECT/UPDATE が未検証 | D6 の切り出し後に data 層テストを足す | 低 | B1 |
| D3 | テスト未カバー | `plugins/forum/index.ts:32-49` ほか | `glab_forum_thread` / `glab_forum_comment` の CRUD が未検証。`tests/audience-visibility.test.ts` は可視性ロジックのみ | D6 の切り出し後に data 層テストを足す | 低 | B1 |
| D4 | テスト未カバー | `plugins/roles/index.ts:18,32,36,42,46` / `plugins/roles/audience.ts:6` | `glab_role_def` / `glab_member_role` の CRUD が未検証。`DEFAULT_ROLE_DEFS` の seed 投入 (`plugins/data.ts:257`) も未検証 | D6 の切り出し後に data 層テストを足す | 低 | B1 |
| D5 | テスト未カバー | `plugins/tech-links/index.ts:34,47,48,148,164` | `glab_tech_link_tag` / `glab_tech_link_comment` の CRUD が未検証 (`tests/tech-links-contract.test.ts` は `glab_tech_link` のみ) | D6 の切り出し後に data 層テストを足す | 低 | B1 |
| D6 | 構造 (D2〜D5 の前提) | `plugins/consult/index.ts` / `plugins/forum/index.ts` / `plugins/roles/index.ts` / `plugins/tech-links/index.ts` | これらのテーブルは `plugins/data.ts` に schema しか無く、クエリは route ハンドラ内のインライン SQL。`CLAUDE.md:15` の「DB schema 変更は `plugins/data.ts` に集約」に schema は従うが、クエリが分散しているため `SqlDb` 単位のテストを書けない | 各モジュールに `store.ts` (または `plugins/data.ts` へ関数追加) を作ってクエリを移し、route はそれを呼ぶだけにする | 中。ルーティングの振る舞いを変えない純粋な移動だが 4 モジュールに跨るため、D2〜D5 とセットで 1 コミットずつに分ける | B1 |

### 種別 E — 旧設計の残骸 (すべて却下)

| # | 種別 | file:line | 内容 | 判定 | 束 |
|---|---|---|---|---|---|
| E1 | Nuntius 前提の記述 (seed S3) | `spec/plan/glab-community-activation.md:77` / `:402` | リポジトリ内の Nuntius 参照はこの 2 箇所のみ (`plugins/` / `bot/` / 他 spec には 0 件) | **却下**。`:77` は「**Nuntius は使わない** (neco 裁定 2026-07-31)。今後フォーラム操作も GLab bot に」、`:402` は「Nuntius 廃止に伴い bot 経由へ作り替え」。どちらも bot 一本化を書いた最新の記述であって旧前提ではない | — |
| E2 | legacy-migration の痕跡 | (該当ファイル無し) | `plugins/events/legacy-migration.ts` は `spec/plan/2026-07-16-review-fix-tasks.md:43` の T6 で削除済み。現在の `plugins/events/` は `aedilis-client.ts` / `facility-store.ts` / `index.ts` / `panel.ts` / `recurrence.ts` / `store.ts` のみ | **却下**。残骸は無い。`spec/data/glab-event.md:14` が「移行処理は撤去済み」と正しく記録している | — |
| E3 | surveys (`glab_survey` 系) の参照 | `spec/data/glab-survey.md:10-11` / `tests/navigation-contract.test.ts:62` | `GLAB_SCHEMA` に `glab_survey*` の `CREATE TABLE` は無く、`tests/navigation-contract.test.ts:62` が `assert.doesNotMatch(dataLayer, /CREATE TABLE IF NOT EXISTS glab_survey/)` で回帰を防いでいる | **却下**。`plugins/volputas/` の `Survey*` 型・`/surveys` ルート (`plugins/volputas/index.ts:10,47,50,57,103,106`) は Volputas を正本とする現行機能であって残骸ではない。`spec/data/glab-survey.md` も退役を明示した文書なので残す | — |
| E4 | SQLite → PostgreSQL 移行後の SQLite 記述 | — | `events` / `facility` に対する SQLite 記述は残っていない。`DESIGN.md:22,54,71` / `spec/feature/events.md:5` / `spec/data/glab-event.md:12` はいずれも PostgreSQL を正本と書き、`plugins/data.ts` に `glab_event` は存在しない | **却下** | — |

### 種別 F — `spec/tasks/*.md` の status

| # | 種別 | file:line | 内容 | 対処案 | 束 |
|---|---|---|---|---|---|
| F1 | done タスクの archive (seed S4) | `spec/tasks/2026-07-16-01-pm-task-source.md:5` (`status: done`) / `spec/tasks/2026-07-16-02-projects-plugin.md:5` (`status: done`) / `spec/tasks/2026-07-16-03-progress-panel.md:5` (`status: in_review`) / `spec/tasks/2026-07-30-01-github-game-list.md` (frontmatter 無し) | done タスクの archive 規約はリポジトリ内に存在しない (`spec/tasks` に README も規約記述も無い) | **現状維持**。加えて 3 ファイルは他文書からパス参照されている (`spec/interface/projects-registry.md:8,86,87` / `spec/interface/calliope-connector.md:101` / `spec/anatomia-domains.md:44`) ため、移動するとリンクが切れる。seed S4 の指摘のうち `2026-07-16-03` は `in_review` であり `done` ではない。`2026-07-30-01-github-game-list.md` は frontmatter 自体を持たないので status 判定の対象外 | — |

### 種別 G — Anatomia ドメイン宣言

| # | 種別 | file:line | 内容 | 対処案 | リスク | 束 |
|---|---|---|---|---|---|---|
| G1 | 未宣言ディレクトリ | `scripts/copy-vendor-assets.mjs` | `.anatomia/domains/*.json` の `targetPattern` 23 件のいずれにも `scripts/` が該当しない。`spec/anatomia-domains.md:47-53` の「意図的に含めないもの」にも `tests/` と `corpus/` しか挙がっていない | `platform-shell` の `targetPattern` に `/scripts/` を足すか、`spec/anatomia-domains.md` の「意図的に含めないもの」にビルド補助スクリプトとして明記する | 低。`.anatomia/domains/*.json` は `source: "manual"` / `lockedFields: ["*"]` なので手編集が正しい経路 (`spec/anatomia-domains.md:14-18`) | B2 |
| G2 | 未追跡ファイル | `.anatomia/link-stability.json` | Anatomia が生成した成果物が未追跡のまま置かれている (対象コミット時点で `git status` に `??` として出る) | commit するか `.gitignore` に足すかを決める。`.anatomia/domains/*.json` が追跡済みなので、生成物か手編集物かで判断する | 低。ただし放置すると全セッションの `git status` が汚れ続ける | B2 |

---

## 3. 束ごとの実施順と検証手順

### B1 — code cleanup PR (`plugins/` / `bot/`)

実施順 (影響の小さいものから、1 項目 = 1 コミット):

1. **A1, A2** — 完全未参照の関数削除。`bot/config-store.ts` の未使用 import も併せて整理。
2. **A3** — `setAttendanceStatus` と `tests/glab-user-data.test.ts` の該当ケース削除。列は残す (§4)。
3. **A4** — 値の過剰 export を外す。`EventStore` / `FacilityStore` は `bot/index.ts:15-16` の import 面を確認してから。
4. **C4** — URL 正規化ヘルパを `plugins/shared.ts` へ 1 本化。
5. **C1, C2** — Aedilis connector 生成のファクトリ化。`registerConnector` は facility 側だけのまま変えない。
6. **C3** — `GLAB_PROJECTS_SERVICE_TOKEN` の読み取りを 1 箇所へ。
7. **D6 → D1〜D5** — クエリを store 層へ切り出し、モジュールごとに CRUD テストを足す。
8. **A5** — 型の過剰 export を外す (件数が多く diff が大きいので最後、単独コミット)。

検証:

| 変更 | 担保 |
|---|---|
| A1〜A5 (export 削除) | `npm run typecheck` — 参照漏れがあれば `tsc --noEmit` が両 tsconfig で落ちる。`progress-view.ts` / `panel.ts` 系は `tsconfig.frontend.json` 側で見る |
| C1〜C4 (共通化) | `npm run typecheck` + `npm test` — `tests/di-entry-points.test.ts` / `tests/volputas-entry-points.test.ts` / `tests/service-auth.test.ts` / `tests/service-health-connector.test.ts` が既存の振る舞いを固定している |
| D1〜D6 (store 切り出し + テスト) | `npm test` — 新規テストは `tests/schema-wal-idempotence.test.ts` と同じく `node:sqlite` の実 SQLite を使う |
| panel 側に触れる変更 (A4 の `renderProject`, A5 の `progress-view.ts` / `contracts.ts`) | `npm run build` — esbuild が `build:panels` の 15 panel を束ねるので、export を外して panel から参照できなくなった場合はここで落ちる |

`npm run dev` / `npm start` によるブラウザ確認は B1 の受け入れ条件に含めない
(`spec/test/strategy.md:27-29` のとおり `progress` パネルの描画確認だけは手動だが、
今回の変更は描画ロジックを変えないため)。

### B2 — spec cleanup PR (`spec/` / `README.md` / `DESIGN.md` / `CLAUDE.md` / `.anatomia/`)

実施順:

1. **B1, B3, B4** — `glab_user.attendance_*` の deprecated 化を 4 文書で同時に直す (バラすと文書間で矛盾する)。
2. **B2** — `DESIGN.md:52` の検証経路を自前検証へ。
3. **B5, B6, B7** — モジュール一覧の網羅漏れ。`README.md:35` は二重管理をやめて `pack.json` 参照に寄せる案を優先。
4. **B8** — `spec/test/strategy.md:35` を現行テスト内容へ。
5. **G1, G2** — Anatomia の宣言範囲と未追跡ファイル。

検証: docs-only のため自動テストは不要。`npm run typecheck` / `npm test` / `npm run build` は
いずれも走らせない。レビューでは「表に書いた `file:line` が対象コミットで実在するか」だけを確認する。

### 束の順序

B2 を先に出す。B1 の A3 / C1 が「何が正本か」の文書判断に依存しており、
B2 で `glab_attendance` が正本だと確定してから B1 のコード削除に進むほうが差し戻しが少ない。

---

## 4. やらないこと

- **`glab_user` の deprecated 列を DROP しない** — `attendance_status` / `attendance_event_id` /
  `attendance_checked_in_at` (`plugins/data.ts:30-36`) と索引 `glab_user_attendance_status`
  (`plugins/data.ts:38-39`) は温存する。`glab_user` 自体は `projects` が参照するため残す方針が
  `spec/feature/attendance.md:22` に明記されている。列を消すと既存 `data/corpus.db` の
  ALTER が必要になり、hub と Bot の 2 ランタイムが WAL 共有している構図で危険。
- **退役済みテーブルを DROP しない** — `glab_survey` / `glab_survey_response` /
  `glab_survey_submission` は `spec/data/glab-survey.md:11` のとおり「データ保全のため自動削除しない」。
  既存 DB に残っている行は触らない。
- **`plugins/volputas/` の survey 関連コードを消さない** — Volputas を正本とする現行機能
  (`plugins/volputas/index.ts:47,50,57,103,106`)。退役したのは GLab 自前の `glab_survey` テーブルだけ。
- **`corpus/` を変更しない** — submodule。Corpus 本体の変更は `LUDIARS/Corpus` 側で PR を出す
  (`CLAUDE.md:10-12`)。
- **`spec/tasks/*.md` を移動・削除しない** — F1 のとおり archive 規約が無く、他文書から
  パス参照されている。
- **`plugins/events/index.ts` で `registerConnector` を呼ばない** — C1 のファクトリ化は
  生成の共通化までとし、connector の登録は `plugins/facility/index.ts:31` の 1 箇所のままにする
  (`spec/plan/2026-07-16-review-fix-tasks.md` T1 の判断)。
- **`spec/plan/glab-community-activation.md` の Nuntius 記述を消さない** — E1 のとおり
  廃止判断そのものを記録した行であり、消すと経緯が失われる。
- **DB の migration を書かない** — この backlog の範囲は不要コードと文書の整理まで。
  schema 変更が必要になった時点で別タスクに切る。

---

## 5. 件数サマリ

| 種別 | 起票 | 却下 | 現状維持 |
|---|---|---|---|
| A デッドコード / 未使用 export | 5 | 0 | 0 |
| B spec ↔ 実装の乖離 | 8 | 0 | 0 |
| C 重複定義 | 4 | 0 | 0 |
| D テスト未カバー | 6 | 0 | 0 |
| E 旧設計の残骸 | 0 | 4 | 0 |
| F `spec/tasks` の status | 0 | 0 | 1 |
| G Anatomia ドメイン宣言 | 2 | 0 | 0 |
| **合計** | **25** | **4** | **1** |

束の内訳: B1 (code cleanup PR) = 15 件 (A1〜A5, C1〜C4, D1〜D6) /
B2 (spec cleanup PR) = 10 件 (B1〜B8, G1, G2)。

seed の判定: S1 = 起票 (C1、ただし「重複登録」ではなく「生成の重複」として) /
S2 = 起票 (A3 + B1) / S3 = 却下 (E1) / S4 = 現状維持 (F1)。

## 関連

- 前回の指摘対応: [`2026-07-16-review-fix-tasks.md`](./2026-07-16-review-fix-tasks.md)
- ドメイン境界: [`../anatomia-domains.md`](../anatomia-domains.md)
- テスト方針: [`../test/strategy.md`](../test/strategy.md)
