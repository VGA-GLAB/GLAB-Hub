---
kind: design
---

# Q: GLAB 学生 PJ を Calliope で PM するとき、タスク正本 / velocity ソース / 自律性境界をどう決めるか

Calliope×GLAB PM 連携 ([`Calliope/docs/design/glab-pm.md`](../../../Calliope/docs/design/glab-pm.md) §H1)
の前提裁定 3 点についての調査と裁定記録。

**status: 裁定済み（2026-07-17 / 裁定者 neco）**

関連: [`spec/tasks/2026-07-16-01-pm-task-source.md`](../tasks/2026-07-16-01-pm-task-source.md)（本件のタスク md）

---

## 0. 裁定結果（2026-07-17 neco）

| 論点 | 裁定 |
|---|---|
| 1. タスク正本 | **Actio コア `tasks` に `project_id` を新設**する（既存軸での代用はしない）。実装は Actio に置き、**操作は GLAB フロントエンドの簡易 UI で完結させる**（学生は Actio の UI を触らない） |
| 2. velocity | **完了実績ベース throughput のみ**（`kFactor=1.0` 固定 + `source` 明示）。`estimated_minutes` の学生必須化を**許容** |
| 3. 自律性 | **PJ リーダーに承認権を渡す**。承認者の身元は **GLAB `glab_project.leader_user_id`（Cernere `user_id`）** で解決し、所属は **Cernere `vantan_user` の所属プロジェクト**を参照する |
| 追加裁定 | **Actio のモジュールリポジトリは全廃止し、Actio 本体に集約する**（→ Actio-SchoolModules は消滅。候補 (b) は選択肢としても無くなる） |

裁定 1 は、当初の提案（既存 `group_id` を PJ 軸に代用する (a')）**ではなく**、
`project_id` を正面から新設する判断。§H1 の候補 (a) を実体として作りにいく。

**本記録が置いた読み**（違えば訂正が要る点）:

- `tasks.project_id` に入る値は **GLAB `glab_project.id`**。PJ レジストリ正本は GLAB のまま
  （glab-pm.md:20-23）で、Actio 側に project マスタは作らない（`project_id` は不透明な参照文字列）。
  これにより Calliope の `projectRef = glab:<project_id>` と自然に一致する。
- 承認経路は **GLAB Web hub 限定**。Discord↔Cernere 突合は未着手（GLAB `DESIGN.md` §8）のままなので、
  **Discord からの承認は不可**。Web hub は Cernere PASETO で認証済みのため身元が立つ（§1.5）。

---

## 1. 現状分析（裁定の根拠となった調査）

調査は Actio / Actio-SchoolModules / Calliope の実コードに対して行った。
**§H1 の選択肢の前提のうち 2 つが、実装の事実と食い違っていた。** まずそこを正す。

### 1.1 Actio 本体 — 「project scope」は存在しなかった

§H1 の候補 (a)「Actio 本体の project scope」は、調査時点では**実在しなかった**。

- コアの `tasks` テーブル（`Actio/src/db/schema.ts:1076-1129`）に `project_id` / `workspace_id` は
  **無い**。分離軸は `owner_id` / `assignee_id` / `group_id` / `plugin_id` の 4 つのみ。
- `modules/task/PLAN.md:29-34` の "scope" は **クエリパラメータ**（`owned` / `assigned` / `group`）で
  あってデータモデルではない（実装 `modules/task/routes.ts:68-76`）。
- Actio の語彙では **project ≒ group**。`user_project_roles`（`schema.ts:832-858`）は `groupId` を参照する。
- `project_id` を持つのは PM モジュールの `pm_tasks`（`src/db/pm-schema.ts:43-82`）だが、これは
  `pm_projects.source: "github" | "notion"`（`pm-schema.ts:22`）が示すとおり **外部ソース同期専用**の
  別系統で、`tasks` との FK も同期コードも無い。

→ **裁定 1 はこの穴を埋める判断**。既存軸（`group_id`）での代用ではなく `project_id` を新設する。

**velocity に必要な材料は既に揃っている**（重要）:

| 要素 | 実装 |
|---|---|
| 見積り | `estimated_minutes`（`schema.ts:1103`、nullable） |
| 完了時刻 | `completed_at`（`schema.ts:1112`）。`status='done'` で**自動セット / 取消で自動クリア**（`modules/task/routes.ts:254-258`, `:179`） |
| 担当 | `assignee_id`（未アサインは `owner_id` に寄せる必要あり） |

制約: `completed_at` に単体インデックスが無い（`schema.ts:1120-1128`）ため期間集計はフルスキャン気味。

**外部 API の穴（裁定 1 の最大の実務課題）**:

- 外部 API（`modules/external-api/`, マウント `src/app.ts:164`）のスコープは
  `"calendar" | "reminders" | "schedules"` の 3 種のみ（`middleware.ts:12`, `spec/data/dbs/api_clients.md:17`）。
  **`tasks` スコープは存在しない** → 外部サービスがタスクを読み書きする正規経路が無い。
- `/api/tasks` 自体は `userContext()`（`src/middleware/auth.ts:44-119`）配下だが、未認証でも 401 を返さず
  anonymous として通し、`resolveUserId()` が `ACTIO_PERSONAL_USER_ID || "local"` に落とす
  （`modules/task/personal.ts:19-25`）。**現状事実上無認証**。
- これは意図的な暫定で、`DESIGN-memoria-task-port.md` に「認証は当面配線しない」、
  外部トークン経路は **Phase E（未着手）** と明記されている。

### 1.2 Actio-SchoolModules — タスクモデルを持たない（→ 追加裁定により廃止）

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

→ **追加裁定により、モジュールリポジトリは全廃止し Actio 本体へ集約する。**
候補 (b) は「選ばない」のではなく**選択肢として消滅**した。

### 1.3 Calliope velocity — agent_runs 直結。ただし注入点はある

- velocity 算出は `src/velocity/engine.ts:22` `makeVelocityEngine.refresh()` と
  `src/velocity/calc.ts:50` `calculateVelocity`。
- agent_runs を読む唯一の実処理は `src/velocity/engine.ts:27` `deps.memoria.listAgentRuns({limit:500})`。
  `VelocityEngineDeps`（`engine.ts:9-14`）は `memoria` を**必須・非 nullable**で要求する。
- さらに `engine.ts:38-42` が **`task.creatorType !== 'ai'` のサンプルを捨てる**。
  → 人間作業の学生 PJ は**構造的にサンプルが 0 件になる**。§H1-2 の指摘どおり。
- 実測値の定義は `actualMinutes(run) = finished_at - started_at`（`engine.ts:16`）。
  **人間作業にはこれに相当する実測時間が存在しない**（これが論点 2 の核心）。
- **一方、疎結合な注入点が 2 つある**:
  - `calculateVelocity`（`calc.ts:50`）は `VelocitySample`（`calc.ts:9-17`）を受ける**純関数**で
    source 非依存。source 依存は `makeVelocityEngine` の側にある。
  - sprint エンジンは `deps.repo.listLatestVelocity()`（`sprint/engine.ts:177`）経由で
    **velocity テーブルの行しか見ない** → 別 source が velocity 行を書けば sprint はそのまま動く。

**sprint が velocity に何を要求するか**（裁定 2 の決め手）:

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

→ **現状の Calliope は完全に単一運営者前提。** 裁定 3（リーダーに承認権を渡す）を成立させるには、
**承認 API への認証導入が必須**。ここを飛ばすと「承認」が名前だけになる（§2.3）。

### 1.5 GLAB 側の身元事情

- 学生の身元は Cernere が単一情報源。GLAB は `user_id` と出席状況のみ保持（`DESIGN.md:95-100`）。
- Web hub は Corpus が `requireAuth` で検証し、プラグインは `getIdentity(c)` で
  `userId / displayName / isAdmin` を得る（`DESIGN.md:90-93`）。→ **Web hub 経由なら身元が立つ。**
- **Discord Bot は Discord ID をそのまま行為主体とし、v0.1 では Cernere と突合しない**
  （`DESIGN.md:90-93`, §8 に follow-up として明記）。
  → **Discord 経由ではリーダー本人性を証明できない。** 裁定 3 の承認経路を Web hub 限定とする根拠。

### 1.6 その他の既存事実（実装の型紙になるもの）

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

## 2. 裁定の内容と論拠

### 2.1 論点 1: タスク正本 — Actio コア `tasks` に `project_id` を新設

**裁定**: Actio に `project_id` を持たせる。実装は Actio 側に置くが、
**操作は GLAB フロントエンドの簡易 UI で完結させる**。

比較（decision-metrics 4 軸。裁定後の実像で再評価）:

| 案 | (1) AI 負荷 | (2) 作業コスト | (3) 解決度 | (4) 一致度 | 結果 |
|----|------------|---------------|-----------|-----------|-------|
| **裁定案: `project_id` 新設 + GLAB 簡易 UI** | 3 | Actio: `project_id` 列 + index + migration ≈40 行 / external-api `tasks` scope **read+write** + routes ≈250 行 / GLAB: 簡易タスク UI パネル ≈300 行 + `glab_project` ≈60 行 / Calliope: refs 改修 **0 行**。計 **≈650 行 / 3 リポ** | 5 | 5 | **採用** |
| (a') `group_id` を PJ 軸に代用 | 3 | ≈200 行 / 2 リポ | 4 | 3 | 不採用 |
| (b) Actio-SchoolModules | — | — | — | — | **消滅**（追加裁定でリポごと廃止） |
| (c) GLAB 自前 SQLite | 3 | ≈640 行 / 2 リポ | 4 | **1** | 不採用（MUSA 違反） |

**裁定案が (a') に優る点**:

- **(4) 一致度**: `group_id` は Actio 全体の共有名前空間で、本来「グループ」であって「プロジェクト」ではない。
  代用すると GLAB の PJ 用 group と他用途の group が同居し、**意味の異なるものを同じ列で区別する**
  負債が残る。`project_id` を正面から持たせるほうが、Actio 自身のドメインとしても正しい。
- **(3) 解決度**: `project_id` があれば PJ 単位の集計軸が一意に決まる。(a') は `group_id` 経由の
  間接参照が常に付きまとう。
- **(2) 作業コスト**が (a') の 3 倍になるのは主に **GLAB 簡易 UI（≈300 行）と write API** の分。
  これは「学生は Actio を触らない」という裁定の帰結であり、`project_id` 新設そのもののコストではない。

**「操作は GLAB 簡易 UI で完結」の帰結（当初提案からの変更点）**:

- 当初提案は external-api `tasks` scope を **read-only** としていた。裁定により
  **read + write が必要**になる（学生のタスク CRUD が GLAB 経由で Actio に届く必要があるため）。
  これは Actio 側の作業量を増やす最大要因。
- GLAB は「PJ レジストリ正本 + 唯一の操作面」になる。タスクの**データ正本は Actio のまま**で、
  GLAB はタスクを自前 DB に持たない（MUSA 原則を維持）。
- Actio の UI は学生に開かない。運営者・AI 側の面としてのみ残る。

**構成**:

1. Actio コア `tasks` に `project_id` を新設。値は **GLAB `glab_project.id`**。
   Actio 側に project マスタは作らない（レジストリ正本は GLAB。glab-pm.md:20-23）。
2. Actio external-api に **`tasks` scope（read + write）**を追加。Actio の Phase E を先取りする形になる。
3. GLAB `plugins/projects/`（glab-pm.md §H2）に**簡易タスク UI** を載せる。学生の入口はここだけ。
4. Calliope は `actio:<task_id>` をそのまま使い、`projectRef` に `glab:<project_id>` を入れる
   （`projectRef` は型なし text なので素通る。§1.6）。**`refs.ts` は無改修**、
   `priority.scope` enum の migration のみ。

### 2.2 論点 2: velocity — 完了実績ベース throughput のみ

**裁定**: 完了実績ベース throughput のみ（`kFactor=1.0` 固定 + `source` 明示）。
`estimated_minutes` の学生必須化を**許容**。

| 案 | (1) AI 負荷 | (2) 作業コスト | (3) 解決度 | (4) 一致度 | 結果 |
|----|------------|---------------|-----------|-----------|-------|
| **(i) 完了実績ベース throughput のみ** | 2 | Calliope `makeStudentVelocitySource` ≈80 行 + 縮退 warning ≈20 行。計 **≈100 行 / 1 リポ** | 4 | 5 | **採用** |
| (ii) 実測時間の自己申告 | 3 | ≈360 行 / 3 リポ | 3 | 2 | 不採用（学生の入力習慣に賭ける。未入力＝サンプル 0 で (i) 以下に劣化） |
| (iii) 見積り申告のみ（未完了 estimate を capacity に） | 1 | ≈40 行 | 2 | 3 | 不採用（「予定」を「実績」として食わせ、velocity が自己成就して破綻） |
| (iv) agent_runs 流用 | — | — | 1 | 1 | **不可**（`velocity/engine.ts:42` が `creatorType !== 'ai'` を全捨て。§1.3） |

**構成**:

- `glab:<project_id>` scope について、Actio コアの「窓 28 日以内に `completed_at` を持つタスク」の
  `Σ estimated_minutes / 28` を `throughput` として velocity テーブルへ書く。
  sprint は `repo.listLatestVelocity()` 経由でこれを読むだけなので **sprint エンジンは無改修**（§1.3）。
- **`kFactor` の扱い**: 人間作業には `actual` が存在しないため `kFactor = median(actual/estimate)` は
  **原理的に計算できない**。よって **`kFactor = 1.0` に固定し、`source: 'actio_completion_only'` として
  velocity 行に明示**する（`goalProgress.source` 判別式 `sprint/engine.ts:376-388` と同じ型紙）。
  **capacity には影響しない**（§1.3）ため実害は task_estimate 補正の精度に限られる。
  **無言フォールバックにしない**（glab-pm.md:64-65 の方針と一致）。
- **`estimated_minutes` 必須化**（裁定で許容）: 現状 nullable（§1.1）。GLAB 簡易 UI で作る学生 PJ タスクは
  必須入力とする。未設定タスクは throughput のサンプルから除外し、**除外件数を warning に出す**。
  ここが空だと `throughput = 0` → `SprintPrerequisiteError(['velocity'])` で sprint が立たない（§1.3）。
- **ブートストラップ**: 窓 28 日に完了タスクが無い立ち上げ期は throughput=0 で sprint が throw する。
  **初回スプリントのみ運営者が暫定 throughput を手入力できる口**を用意し、
  `source: 'operator_seed'` として明示する（縮退の明示扱い）。

### 2.3 論点 3: 自律性 — PJ リーダーに承認権を渡す

**裁定**: PJ リーダーに承認権を渡す。承認者の身元は
**GLAB `glab_project.leader_user_id`（Cernere `user_id`）** で解決し、
所属は **Cernere `vantan_user` の所属プロジェクト**を参照する。

| 案 | (1) AI 負荷 | (2) 作業コスト | (3) 解決度 | (4) 一致度 | 結果 |
|----|------------|---------------|-----------|-----------|-------|
| **裁定案: リーダー承認（Cernere `user_id` で身元解決 / Web hub 限定）** | 4 | Cernere: `vantan_user` に所属 PJ ≈60 行 / GLAB: `glab_project.leader_user_id` ≈40 行 + 承認 UI ≈150 行 / Calliope: `confirmation.approverRole`+`projectRef` migration ≈60 行 + **承認 API 認証** ≈120 行 + GLabConnector に leader 解決 ≈60 行。計 **≈490 行 / 3 リポ** | 5 | 5 | **採用** |
| (A) 運営者のみ | 2 | ≈70 行 | 4 | 5 | 不採用（当初提案。身元解決の道筋が付いたため不要に） |
| (C) 学生 PJ にも auto-apply | 1 | 0 行 | 2 | **1** | 不採用（他人の計画の無断改変） |

**当初提案（運営者のみ）から裁定案へ変わった理由**:

当初 (B) を退けたのは「承認 API に認証が無く、Discord↔Cernere も未突合なので**リーダー本人性を
証明する経路が無い**」ためだった（§1.4, §1.5）。裁定で示された構成はこの穴を塞ぐ:

- **リーダーの指名**を GLAB `glab_project.leader_user_id`（Cernere `user_id`）で持つ
  → 「誰がリーダーか」が単一情報源で確定する。
- **承認者の本人性**は Web hub の Cernere PASETO 認証（`getIdentity(c)` → `userId`）で立つ（§1.5）
  → Discord↔Cernere 突合を**迂回できる**（＝ GLAB `DESIGN.md` §8 の未着手 follow-up に依存しない）。

**構成**:

1. **Cernere `vantan_user` に所属プロジェクトを追加**。学生 → PJ の所属の正本は Cernere
   （身元属性は Cernere が単一情報源、という GLAB の既定方針と整合。`spec/data/vantan-user.md`）。
2. **GLAB `glab_project` に `leader_user_id`（Cernere `user_id`）**。PJ エンティティとリーダー指名の
   正本は GLAB（PJ 側の属性なので GLAB が持つ）。
3. Calliope は GLabConnector 経由で `glab:<project_id>` のリーダー `user_id` を解決し、
   `confirmation` に **`projectRef` + `approverRole`** を持たせる（現状どちらも無い。§1.4）。
4. **`POST /api/confirmations/:id` に認証を導入**し、`decidedBy` を自由文字列から
   **認証済み Cernere `user_id`** に変える。**これは裁定 3 の必須前提**
   — 入れないと誰でも `{decidedBy:"リーダーの名前"}` を POST でき、承認が名前だけになる（§1.4）。
5. **承認経路は GLAB Web hub 限定**。Discord からの承認は不可（§1.5）。
6. `glab:*` の書込は**リスク判定を通さず一律 `requiresConfirmation: true`**（低リスク auto-apply を
   学生 PJ に適用しない）。承認者はリーダー、運営者は上位承認者として残す。

---

## 3. 影響範囲

### 3.1 裁定を実装すると変わるもの

| リポ | 対象 | 変更 | 論点 |
|---|---|---|---|
| Actio | `src/db/schema.ts:1076-1129` | **`tasks.project_id` 新設** + index + migration | 1 |
| Actio | `modules/external-api/middleware.ts:12` | `ApiScope` に `"tasks"` 追加 | 1 |
| Actio | `modules/external-api/routes.ts` | tasks **read + write** routes（`project_id` フィルタ） | 1 |
| Actio | `spec/data/dbs/api_clients.md:17` | scope 既定値の記述更新 | 1 |
| Actio | `src/db/schema.ts:1120-1128` | `completed_at` インデックス追加（集計性能。§1.1） | 2 |
| Actio | `modules/task/routes.ts` | `estimated_minutes` 必須化の検証（GLAB 経由分） | 2 |
| Actio | リポ構成 | **モジュールリポジトリを本体へ集約**（→ §3.3） | 追加裁定 |
| Cernere | `vantan_user` | **所属プロジェクト列**追加 + `data_sharing` 範囲更新 | 3 |
| GLAB | `plugins/data.ts` | `glab_project`（`id`/`name`/`status`/**`leader_user_id`**/`repo_url?`）。migration 規約: INDEX は ALTER の後、冪等 | 1, 3 |
| GLAB | `plugins/projects/` | PJ 登録・編集 + **簡易タスク UI**（学生の唯一の操作面） | 1 |
| GLAB | `plugins/progress/` | 進捗表示 + **リーダー承認 UI** | 3 |
| GLAB | `spec/data/vantan-user.md` | 所属プロジェクトを扱う列として追記 | 3 |
| GLAB | `spec/data/`, `spec/interface/` | `glab_project` スキーマ / Actio 連携の doc | 1 |
| Calliope | `src/velocity/` | `makeStudentVelocitySource`（Actio only、`calculateVelocity` 再利用） | 2 |
| Calliope | `src/db/schema.ts:116` | `priority.scope` enum に `glab` 追加（migration） | 1 |
| Calliope | `src/db/schema.ts:100-112` | `confirmation` に **`projectRef` + `approverRole`**（migration） | 3 |
| Calliope | `src/routes/confirmations.ts:14,46` | **承認 API に認証導入**（`decidedBy` を認証済み `user_id` に） | 3 |
| Calliope | `src/reschedule/engine.ts:103-118` | `glab:*` は auto-apply 対象外に | 3 |
| Calliope | `src/clients/glab.ts` | 新規（glab-pm.md §H3）。leader 解決を含む | 1, 3 |

### 3.2 変わらないもの（＝裁定がこれを守っている）

- **Calliope `src/refs.ts`** — `actio:` をそのまま使うので**無改修**（(c) を採ると `glab:` source
  追加が必要だった。§1.6）。
- **Calliope `src/sprint/engine.ts` / `capacity.ts`** — velocity テーブル経由なので**無改修**（§1.3）。
- **GLAB のタスク自前保持** — しない。GLAB は操作面 + PJ レジストリのみで、タスク正本は Actio
  （MUSA 原則を維持）。
- **GLAB corpus submodule** — 触らない（GLAB `CLAUDE.md`）。
- **Cernere が身元の単一情報源** — 変わらない。所属プロジェクトも Cernere 側に置くことで一貫する。

### 3.3 下流タスクへの影響

- `GLAB/spec/tasks/2026-07-16-02-projects-plugin.md` — **スコープ拡大**。`leader_user_id` と
  **簡易タスク UI** が追加される（当初はレジストリ + メンバー割当のみの想定だった）。
- `Calliope/spec/tasks/2026-07-16-04-glab-client.md`（`status: pending`）— 着手可能に。
  `refs.ts` 改修不要が確定したぶん見積りが下がる。leader 解決が追加。
- `Calliope/spec/tasks/2026-07-16-05-glab-sprint-progress.md`（`status: pending`）— velocity source が
  確定したため「流入予約のみの縮退モード」の実装形が決まる。
- **新規に必要（Actio）**: ① `tasks.project_id` 新設、② external-api `tasks` scope（read+write）、
  ③ **モジュールリポジトリの本体集約**。**①②が本連携の最長依存**。
- **新規に必要（Cernere）**: `vantan_user` の所属プロジェクト。
- **新規に必要（Calliope）**: 承認 API の認証導入（裁定 3 の必須前提）。

### 3.4 未解決のまま残るもの

- **リーダーと所属の整合性** — リーダー指名は GLAB（`glab_project.leader_user_id`）、所属は Cernere
  （`vantan_user`）に分かれる。**「所属していない者がリーダーに指名されている」状態が構造的に作れる**。
  どちらを正とするか / 整合性検証をどこで行うかは projects プラグイン実装時に決める必要がある。
- **Discord からの承認** — 不可のまま（§1.5）。Discord↔Cernere 突合（GLAB `DESIGN.md` §8）が
  実装されれば解禁を再検討できる。
- Actio コア `/api/tasks` の無認証問題（§1.1）は、`tasks` scope 追加で**外部経路は塞がるが、
  内部直叩き経路は残る**。Actio 側 Phase E の本題であり、本裁定の範囲外。
- 見積り精度の教育的側面（学生が見積りを学ぶこと自体が PJ の価値かどうか）は設計外の教育方針。
