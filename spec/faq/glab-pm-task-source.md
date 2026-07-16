---
kind: design
---

# Q: GLAB 学生 PJ を Calliope で PM するとき、タスク正本 / velocity ソース / 自律性境界をどう決めるか

Calliope×GLAB PM 連携 ([`Calliope/docs/design/glab-pm.md`](../../../Calliope/docs/design/glab-pm.md) §H1)
の前提裁定 3 点についての調査と提案。**裁定者は neco。本ドキュメントは提案であり確定ではない。**

関連: [`spec/tasks/2026-07-16-01-pm-task-source.md`](../tasks/2026-07-16-01-pm-task-source.md)（本件のタスク md）

---

## 1. 現状分析

調査は Actio / Actio-SchoolModules / Calliope の実コードに対して行った。
**§H1 の選択肢の前提のうち 2 つが、実装の事実と食い違っている。** まずそこを正す。

### 1.1 Actio 本体 — 「project scope」は存在しない

§H1 の候補 (a)「Actio 本体の project scope」は、**そのままの形では実在しない**。

- コアの `tasks` テーブル（`Actio/src/db/schema.ts:1076-1129`）に `project_id` / `workspace_id` は
  **無い**。分離軸は `owner_id` / `assignee_id` / `group_id` / `plugin_id` の 4 つのみ。
- `modules/task/PLAN.md:29-34` の "scope" は **クエリパラメータ**（`owned` / `assigned` / `group`）で
  あってデータモデルではない（実装 `modules/task/routes.ts:68-76`）。
- Actio の語彙では **project ≒ group**。`user_project_roles`（`schema.ts:832-858`）は `groupId` を参照する。
- `project_id` を持つのは PM モジュールの `pm_tasks`（`src/db/pm-schema.ts:43-82`）だが、これは
  `pm_projects.source: "github" | "notion"`（`pm-schema.ts:22`）が示すとおり **外部ソース同期専用**の
  別系統で、`tasks` との FK も同期コードも無い。

つまり (a) を採るなら、実際には **「Actio コア `tasks` + `group_id` を PJ 軸に使う」**（以下 (a')）という
意味になる。これは新規概念の発明ではなく、Actio が既に持つ分離軸をそのまま使う案である。

**velocity に必要な材料は揃っている**（重要）:

| 要素 | 実装 |
|---|---|
| 見積り | `estimated_minutes`（`schema.ts:1103`、nullable） |
| 完了時刻 | `completed_at`（`schema.ts:1112`）。`status='done'` で**自動セット / 取消で自動クリア**（`modules/task/routes.ts:254-258`, `:179`） |
| 担当 | `assignee_id`（未アサインは `owner_id` に寄せる必要あり） |

制約: `completed_at` に単体インデックスが無い（`schema.ts:1120-1128`）ため期間集計はフルスキャン気味。

**外部 API の穴（最大の実務課題）**:

- 外部 API（`modules/external-api/`, マウント `src/app.ts:164`）のスコープは
  `"calendar" | "reminders" | "schedules"` の 3 種のみ（`middleware.ts:12`, `spec/data/dbs/api_clients.md:17`）。
  **`tasks` スコープは存在しない** → 外部サービスがタスクを読む正規経路が無い。
- `/api/tasks` 自体は `userContext()`（`src/middleware/auth.ts:44-119`）配下だが、未認証でも 401 を返さず
  anonymous として通し、`resolveUserId()` が `ACTIO_PERSONAL_USER_ID || "local"` に落とす
  （`modules/task/personal.ts:19-25`）。**現状事実上無認証**。
- これは意図的な暫定で、`DESIGN-memoria-task-port.md` に「認証は当面配線しない」、
  外部トークン経路は **Phase E（未着手）** と明記されている。

### 1.2 Actio-SchoolModules — タスクモデルを持たない

候補 (b) は、実体を確認する限り **タスク正本の置き場としては成立しない**。

- 正体は Actio(Schedula) の**プラグイン 1 個**（`curriculum-scheduler`）を収めたリポジトリ。
  別サービスではない（`src/index.ts:29` で SDK の `defineModule()` を export）。
- 所有テーブルは `curriculum_scheduler_imports` **1 本のみ**（`src/tables.ts:13-52`）。これは
  カリキュラム JSON の**取り込み履歴（audit trail）**であって課題・タスクではない。
  学生の課題 / 提出物 / 成績に相当するカラムは 0。
- 役割は Calicula 由来のカリキュラム JSON を MyPlan（週間ルーティーン）へ登録すること。
- 完成度: Phase 2.0 まで実装（`src/` 約 841 行 / テスト 401 行、コミット 4 本）だが、
  **Phase 2.1〜3.1 はすべて未着手**（`spec/module-scope.md`）。さらに本番経路は
  Actio 本体の `ctx.modules.invoke` が `"not implemented (Phase 2)"` を throw する
  （`Actio/src/plugins/context.ts:111`）ため **dev fallback でしか通らない**。
- `manifest.json` の `depends` にある `school` モジュールは**このリポに存在しない**（別パッケージ）。

→ (b) を選ぶことは「学生 PJ のタスクモデルをゼロから作り、かつ本体側の未実装ブロッカーを先に解除する」
ことを意味する。(c) の自前実装と工数はほぼ変わらず、加えて他人のブロッカーに依存する。

### 1.3 Calliope velocity — agent_runs 直結。ただし注入点はある

- velocity 算出は `src/velocity/engine.ts:22` `makeVelocityEngine.refresh()` と
  `src/velocity/calc.ts:50` `calculateVelocity`。
- agent_runs を読む唯一の実処理は `src/velocity/engine.ts:27` `deps.memoria.listAgentRuns({limit:500})`。
  `VelocityEngineDeps`（`engine.ts:9-14`）は `memoria` を**必須・非 nullable**で要求する。
- さらに `engine.ts:38-42` が **`task.creatorType !== 'ai'` のサンプルを捨てる**。
  → 人間作業の学生 PJ は**構造的にサンプルが 0 件になる**。§H1-2 の指摘どおり。
- 実測値の定義は `actualMinutes(run) = finished_at - started_at`（`engine.ts:16`）。
  **人間作業にはこれに相当する実測時間が存在しない**（これが本論点の核心）。
- **一方、疎結合な注入点が 2 つある**:
  - `calculateVelocity`（`calc.ts:50`）は `VelocitySample`（`calc.ts:9-17`）を受ける**純関数**で
    source 非依存。source 依存は `makeVelocityEngine` の側にある。
  - sprint エンジンは `deps.repo.listLatestVelocity()`（`sprint/engine.ts:177`）経由で
    **velocity テーブルの行しか見ない** → 別 source が velocity 行を書けば sprint はそのまま動く。

**sprint が velocity に何を要求するか**（設計上きわめて重要）:

```ts
// Calliope/src/sprint/capacity.ts:45-48
const rawCapacityMinutes = input.throughputPerDay * input.sprintDays;
const bugReserveMinutes = input.remainingBugCount * input.averageBugEffortMinutes;
const inflowReserveMinutes = input.inflowLambda * input.sprintDays * input.averageInflowEffortMinutes;
const effectiveCapacityMinutes = Math.max(rawCapacityMinutes - bugReserveMinutes - inflowReserveMinutes, 0);
```

- 容量計算が使うのは **`throughput` のみ**（`sprint/engine.ts:230` `throughputPerDay: velocity?.throughput ?? 0`）。
  **`kFactor` は capacity に入らない**（kFactor は task_estimate 補正・reschedule 側で効く）。
- `throughput = Σestimate / windowDays`（`calc.ts:65-104`、窓 28 日 `calc.ts:4`）。
  → **見積りと完了時刻さえあれば算出でき、実測時間は要らない。**
- ただし velocity は sprint の **hard prerequisite**。0 / 欠損なら
  `SprintPrerequisiteError(['velocity'])`（`engine.ts:180, :316`）、`capacity.ts:31-33` も throw。

### 1.4 Calliope 自律性 — 承認者モデルが存在しない

- 現行は **2 段モデル**（`DESIGN.md:89-93`）: 低リスク auto-apply / 高リスク
  `409 human_confirmation_required`。リスク判定 `reschedule/risk.ts:16` は
  **閾値なしの二値**（reason が 1 つでもあれば high）。
- `confirmation` テーブル（`src/db/schema.ts:100-112`）は `kind` / `status` / `decidedBy` / TTL 24h。
  **`approverRole` / `projectRef` / `requiredApprover` 相当のカラムは無い。**
- 承認 API は `POST /api/confirmations/:id`（`routes/confirmations.ts:46`）。
  `decidedBy: z.string().trim().min(1).default('human')`（`:14`）— **デフォルト文字列 `'human'`、
  認証なし、誰でも approve できる**。
- `reschedule_log.appliedBy` は `enum(['human','auto'])`（`schema.ts:93`）の 2 値のみ。
- `autonomy level` という設定・enum は存在しない。「Decision Inbox」は設計文書上の語で
  **コードには無い**（grep 0 件）。
- 実装自身が文脈不足を明示している: `reschedule/engine.ts:151`
  `notificationStatus: 'not_sent_missing_authenticated_project_context'`。

→ **現状の Calliope は完全に単一運営者前提**。PJ リーダー承認を入れるには
schema 拡張 + `decidedBy` の認証が最低限必要。

### 1.5 GLAB 側の身元事情

- 学生の身元は Cernere が単一情報源。GLAB は `user_id` と出席状況のみ保持（`DESIGN.md:95-100`）。
- **Discord Bot は Discord ID をそのまま行為主体とし、v0.1 では Cernere と突合しない**
  （`DESIGN.md:90-93`, §8 に follow-up として明記）。
  → **「PJ リーダー本人である」ことを現時点で Discord 経由では証明できない。**

### 1.6 その他の既存事実（提案の型紙になるもの）

- Calliope `refs.ts:1-3` の `TaskRef` は `actio` / `actio-pm` の 2 source のみ。
  `parseTaskRef`（`:27-36`）は `^actio:` / `^actio-pm:` 固定で、**`glab:` は throw**。
  `requireRefPart`（`:5-11`）は `:` `/` を含む値を拒否する。
- 一方 `projectRef` は**型なしの生 text**（`sprint.projectRef` `schema.ts:34`,
  `velocity.projectRef` `:66`）。`priority.scope` **のみ** enum（`:116`）で migration 必要。
- Gompertz は Actio 側計算の消費（`clients/actio.ts:29-31` → `GET /api/pm/projects/:id/analytics/gompertz`）。
  Calliope の Actio クライアントは**全 7 本すべて read-only、書込は 0 本**。
- 「縮退の明示」の型紙は既にある: `goalProgress.source` 判別式
  （`sprint/engine.ts:376-388` — `'memoria_goal_eval'` vs `'actio_completion_fallback'` を戻り値に明示）
  と `warnings` 配列（`engine.ts:209, 216-218, 225-227, 237`）。

---

## 2. 提案

### 論点 1: 学生 PJ のタスク正本の置き場

| 案 | (1) AI 負荷 | (2) 作業コスト | (3) 解決度 | (4) 一致度 | 採用? |
|----|------------|---------------|-----------|-----------|-------|
| **(a') Actio コア `tasks` + `group_id` を PJ 軸** | 3 | Actio external-api に `tasks` scope + read routes ≈150 行 / `api_clients` scope 拡張 ≈10 行 / GLAB `glab_project.actio_group_id` 列 1 本 + 発行導線 ≈40 行 / Calliope 側 refs 改修 **0 行**（`actio:` のまま）。計 **≈200 行 / 2 リポ** | 5 | 5 | **◎ 推奨** |
| (b) Actio-SchoolModules | 4 | タスクモデルを新規（テーブル + CRUD + API ≈500 行）+ Calliope client ≈100 行 + **本体 `ctx.modules.invoke` Phase 2 の解除（他リポのブロッカー）**。計 **≈600 行 + 外部依存** | 2 | 2 | **× ブロッカー依存 + 学校ドメインですらない** |
| (c) GLAB 自前 SQLite | 3 | `glab_task` schema + クエリ ≈150 行 / CRUD API ≈120 行 / パネル ≈250 行 / Calliope `glab:` source 拡張（`refs.ts` + `priority.scope` migration）≈120 行。計 **≈640 行 / 2 リポ** | 4 | **1** | **× MUSA 違反（タスクエンジン二重実装）** |

**推奨: (a')**。理由を軸ごとに:

- **(4) 一致度**が決定的。glab-pm.md:20-23 の「bind, don't reimplement」「GLAB にタスクエンジンを
  作らない / Calliope が task 正本を持たない」に照らすと、(c) はコンセプトそのものへの違反。
  (b) は「学校向け」という名前に反し、実体はカリキュラム→MyPlan 変換であって**タスクドメインですらない**
  （§1.2）。名前で選ぶと外す。
- **(3) 解決度**: (a') は Calliope の既存 Actio クライアント（`clients/actio.ts:21` `listTasks`）と
  `actio:` task_ref がそのまま使え、velocity に必要な `estimated_minutes` / `completed_at` も既存
  （§1.1）。追加が要るのは**読み口の認証だけ**。
- **(2) 作業コスト**: (a') が最小。(b)/(c) は 3 倍。
- **(1) AI 負荷**: 大差なし（(b) のみ他リポのブロッカー解除調査で +1）。

**(a') の具体形**:

1. GLAB `glab_project` に `actio_group_id` を持たせ、**GLAB PJ ↔ Actio group を 1:1 バインド**する
   （glab-pm.md §H2 の projects プラグインに列 1 本追加）。GLAB はレジストリ正本のまま、タスクは持たない。
2. Actio external-api に **`tasks` scope（read-only）** を追加する。これは Actio 側の
   **Phase E の一部を先取りする**ことに等しく、Calliope 以外の外部連携にも効く。
3. Calliope は `actio:<task_id>` をそのまま使い、`projectRef` に `glab:<project_id>` を入れる
   （`projectRef` は型なし text なので素通る。§1.6）。**`refs.ts` の改修は不要**、
   `priority.scope` enum の migration のみ必要。

**(a') の要注意点（裁定時に認識しておくべき負債）**:

- Actio コアタスクは現状**事実上無認証**（§1.1）。学生 PJ を載せる = 学生の作業データを載せる、
  なので **`tasks` scope 追加は「あると便利」ではなく前提条件**。ここを飛ばすと degraded ですらなく穴になる。
- `group_id` は Actio 全体の共有名前空間。GLAB の PJ 用 group と他用途の group が同居する。
  GLAB 側で `actio_group_id` を正本管理し、衝突は GLAB の責任範囲とする。

### 論点 2: velocity ソース

前提の再確認（§1.3）: **sprint の容量計算は `throughput` しか使わない。`throughput = Σestimate / windowDays`
なので、実測時間なしで算出できる。** ここが選択を大きく変える。

| 案 | (1) AI 負荷 | (2) 作業コスト | (3) 解決度 | (4) 一致度 | 採用? |
|----|------------|---------------|-----------|-----------|-------|
| **(i) 完了実績ベース throughput のみ（`kFactor` 固定 1.0 + 縮退明示）** | 2 | Calliope に `makeStudentVelocitySource`（Actio only、`calculateVelocity` 再利用）≈80 行 + 縮退 warning ≈20 行。計 **≈100 行 / 1 リポ** | 4 | 5 | **◎ 推奨** |
| (ii) 学生の実測時間 自己申告（`actual_minutes` 新設） | 3 | Actio `tasks` に `actual_minutes` 列 + migration ≈30 行 / 入力 UI ≈150 行 / GLAB 側導線 ≈100 行 / Calliope 改修 ≈80 行。計 **≈360 行 / 3 リポ** | 3 | 2 | **× 学生の入力習慣に賭ける。未入力＝サンプル 0 で (i) 以下に劣化** |
| (iii) 見積り申告のみ（未完了タスクの estimate を capacity に） | 1 | ≈40 行 | 2 | 3 | **× 「予定」を「実績」として食わせる。velocity が自己成就して破綻** |
| (iv) agent_runs 流用 | — | — | 1 | 1 | **× 構造的に不可（`creatorType !== 'ai'` で全捨て、§1.3）** |

**推奨: (i)**。

- **仕組み**: `glab:<project_id>` scope について、Actio コアの
  「窓 28 日以内に `completed_at` を持つタスク」の `Σ estimated_minutes / 28` を `throughput` として
  velocity テーブルへ書く。sprint は `repo.listLatestVelocity()` 経由でこれを読むだけなので
  **sprint エンジンは無改修**（§1.3 の注入点）。
- **`kFactor` の扱い**: 人間作業には `actual` が存在しないため
  `kFactor = median(actual/estimate)` は**原理的に計算できない**。よって **`kFactor = 1.0` に固定し、
  `source: 'actio_completion_only'` として velocity 行に明示**する
  （`goalProgress.source` 判別式 `sprint/engine.ts:376-388` と同じ型紙）。
  これは **capacity には影響しない**（§1.3）ので実害は task_estimate 補正の精度に限られる。
  **無言フォールバックにしない**こと（glab-pm.md:64-65 の方針と一致）。
- **(4) 一致度が最高な理由**: 学生に新しい入力義務を課さず、既にある「タスクを done にする」行為だけで
  velocity が立つ。PM 秘書が学生の手間を増やしたら本末転倒。
- **(3) が 5 でなく 4 な理由**: 見積りの質に全面依存する。見積りが下手なら throughput も歪む。
  ただしこれは (ii) でも同じで、(ii) は追加で「実測入力を続けてくれるか」にも賭ける分だけ悪い。
- **必須の付帯条件**: `estimated_minutes` は現状 nullable（§1.1）。**GLAB 経由で作る学生 PJ タスクは
  `estimated_minutes` を必須化する**（未設定タスクは throughput のサンプルから除外し、
  除外件数を warning に出す）。ここが空だと `throughput = 0` → `SprintPrerequisiteError(['velocity'])`
  で sprint が立たない（§1.3）。
- **ブートストラップ**: 窓 28 日に完了タスクが無い立ち上げ期は throughput=0 で sprint が throw する。
  **初回スプリントのみ運営者が暫定 throughput を手入力できる口**を用意し、
  `source: 'operator_seed'` として明示する（これも縮退の明示扱い）。

### 論点 3: 自律性境界

| 案 | (1) AI 負荷 | (2) 作業コスト | (3) 解決度 | (4) 一致度 | 採用? |
|----|------------|---------------|-----------|-----------|-------|
| **(A) 運営者のみ（PJ リーダー承認なし）+ 前方互換スロット** | 2 | `confirmation` に `projectRef` 列 1 本 + migration ≈30 行 / GLAB PJ 用の書込は全件 confirmation 経由に強制 ≈40 行。計 **≈70 行** | 4 | 5 | **◎ 推奨（第 1 段）** |
| (B) PJ リーダー承認を挟む | 4 | `confirmation` に `approverRole`/`requiredApprover` + migration ≈60 行 / `POST /api/confirmations/:id` に**認証導入** ≈120 行 / GLAB → Calliope の身元連携 ≈150 行 / **Discord↔Cernere 突合（DESIGN.md §8 の未着手 follow-up）** ≈200 行。計 **≈530 行 + 未着手 follow-by 依存** | 3 | 3 | **× 今は成立しない。§1.5 参照** |
| (C) 学生 PJ にも低リスク auto-apply を許す | 1 | 0 行 | 2 | 1 | **× 学生の計画を無断で書き換える。PM 秘書の信頼を最初に壊す** |

**推奨: (A)**。

- **(B) が今できない理由が決定的**: 承認 API は `decidedBy` が**認証なしの自由文字列**（§1.4）。
  この状態で「PJ リーダー承認」を実装しても、**誰でも `{decidedBy:"リーダーの名前"}` を POST できる**ので
  承認として機能しない。さらに GLAB の Discord Bot は **v0.1 で Cernere と突合しない**（§1.5）ため、
  リーダー本人性を証明する経路自体が無い。**承認機構は、身元が証明できて初めて意味を持つ。**
  (B) は「やらない」のではなく **「前提が揃うまで待つ」**。
- **(C) が最悪な理由**: 現行の低リスク auto-apply（`reschedule/engine.ts:103-118`）は
  「AI が自分の仕事を並べ替える」文脈だから許される。学生 PJ では**他人の計画の無断改変**になる。
  (4) 一致度 1。
- **(A) の具体形**:
  1. `projectRef` が `glab:*` の書込（タスク生成・リスケ適用）は、**リスク判定を通さず一律
     `requiresConfirmation: true`** とする。低リスク auto-apply を学生 PJ には適用しない。
  2. `confirmation` に `projectRef` 列を足し、運営者が PJ 別に判断できるようにする
     （現状 confirmation には PJ を識別する列が無い。§1.4）。
  3. **前方互換スロット**: `decidedBy` を「運営者の Cernere `user_id`」で埋める運用に寄せておく。
     将来 (B) へ移る際、`approverRole` 追加 + 認証導入だけで済み、データは捨てずに済む。
  4. PJ リーダーは **read + 意見表明まで**（GLAB progress パネル）。承認権は持たない。
- **(B) へ移る条件（裁定に含めたい）**: ① `POST /api/confirmations/:id` の認証実装、
  ② Discord↔Cernere 突合（GLAB `DESIGN.md` §8）、③ `glab_project_member.role='leader'` の運用実績。
  この 3 つが揃った時点で再裁定。

---

## 3. 影響範囲

### 3.1 提案を採った場合に変わるもの

| リポ | 対象 | 変更 | 論点 |
|---|---|---|---|
| Actio | `modules/external-api/middleware.ts:12` | `ApiScope` に `"tasks"` 追加 | 1 |
| Actio | `modules/external-api/routes.ts` | tasks read routes（list / get、`group_id` フィルタ） | 1 |
| Actio | `spec/data/dbs/api_clients.md:17` | scope 既定値の記述更新 | 1 |
| Actio | `src/db/schema.ts:1120-1128` | `completed_at` インデックス追加（集計性能。§1.1） | 2 |
| GLAB | `plugins/data.ts` | `glab_project.actio_group_id` 列（migration 規約: INDEX は ALTER の後、冪等） | 1 |
| GLAB | `plugins/projects/` | group バインド導線 + `estimated_minutes` 必須化の UI 表現 | 1, 2 |
| GLAB | `spec/data/`, `spec/interface/` | projects スキーマ / Actio 連携の doc | 1 |
| Calliope | `src/velocity/` | `makeStudentVelocitySource`（Actio only、`calculateVelocity` 再利用） | 2 |
| Calliope | `src/db/schema.ts:116` | `priority.scope` enum に `glab` 追加（migration） | 1 |
| Calliope | `src/db/schema.ts:100-112` | `confirmation.projectRef` 列追加（migration） | 3 |
| Calliope | `src/reschedule/engine.ts:103-118` | `glab:*` は auto-apply 対象外に | 3 |
| Calliope | `src/clients/glab.ts` | 新規（glab-pm.md §H3。本裁定の下流） | 1 |

### 3.2 変わらないもの（＝提案がこれを守っている）

- **Calliope `src/refs.ts`** — `actio:` をそのまま使うので**無改修**（(c) を採ると `glab:` source
  追加が必要になる。§1.6）。
- **Calliope `src/sprint/engine.ts` / `capacity.ts`** — velocity テーブル経由なので**無改修**（§1.3）。
- **GLAB corpus submodule** — 触らない（GLAB CLAUDE.md）。
- **Cernere `vantan_user`** — 名前・役職・学科の単一情報源のまま。GLAB は複製しない。

### 3.3 下流タスクへの影響

- `GLAB/spec/tasks/2026-07-16-02-projects-plugin.md` — `actio_group_id` 列と group 発行導線が追加スコープになる。
- `Calliope/spec/tasks/2026-07-16-04-glab-client.md`（`status: pending`）— 本裁定が着手前提。
  `refs.ts` 改修不要が確定すれば見積りが下がる。
- `Calliope/spec/tasks/2026-07-16-05-glab-sprint-progress.md`（`status: pending`）— velocity source が
  (i) に決まれば「流入予約のみの縮退モード」の実装形が確定する。
- **新規に必要**: Actio 側の「external-api `tasks` scope 追加」タスク。**これが最長の依存**で、
  他リポ（Actio）の作業になる。裁定時にここを認識しておきたい。

### 3.4 未解決のまま残るもの

- Actio コア `/api/tasks` の無認証問題（§1.1）は、`tasks` scope 追加で**外部経路は塞がるが、
  内部直叩き経路は残る**。Actio 側 Phase E の本題であり、本裁定の範囲外。
- Discord↔Cernere 突合（GLAB `DESIGN.md` §8）— 論点 3 の (B) 移行条件。本裁定では (A) を選ぶことで回避。
- 見積り精度の教育的側面（学生が見積りを学ぶこと自体が PJ の価値かどうか）は設計外の教育方針。
  neco の判断領域。

---

## 4. 裁定依頼（neco 宛）

以下 3 点の裁定をお願いします。**本セッションでは確定させていません。**

| 論点 | 提案 | 最大の論拠 |
|---|---|---|
| 1. タスク正本 | **(a') Actio コア `tasks` + `group_id` を PJ 軸**（+ Actio external-api に `tasks` scope 追加） | §H1 の (a)「project scope」は実在せず、実体は `group_id`。(b) はタスクモデルを持たずブロッカー依存、(c) は MUSA 違反 |
| 2. velocity | **(i) 完了実績ベース throughput のみ / `kFactor=1.0` 固定 + `source` 明示** | sprint の capacity は `throughput` しか使わない（`capacity.ts:45`）→ 実測時間なしで成立。学生に新たな入力義務を課さない |
| 3. 自律性 | **(A) 運営者のみ + 前方互換スロット**（`glab:*` は auto-apply 対象外） | 承認 API が認証なし（`decidedBy` 自由文字列）+ Discord↔Cernere 未突合 → (B) は現時点で承認として機能しない |

**特に確認いただきたい点**:

1. **(a') は Actio 側の作業（external-api `tasks` scope）を必ず伴います。** これを GLAB/Calliope の
   スコープ外タスクとして起票してよいか。ここが本連携の最長依存です。
2. **論点 2 で `estimated_minutes` を学生に必須化します。** 「見積りを書かせる」ことが学生 PJ の運用として
   受容可能か（教育的にはむしろ有益と考えていますが、neco の方針判断領域です）。
3. **論点 3 は「PJ リーダーに承認権を渡さない」判断です。** 前提が揃えば (B) に移れる設計にしていますが、
   当面リーダーは read + 意見表明までとなります。これが GLAB の運用感に合うか。
