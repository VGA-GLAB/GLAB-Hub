---
task: 01-pm-task-source
project: GLAB
kind: 設計相談
status: decided
delegation_run_id: 14f09b4b-4518-444b-956e-a815896b236e
created: 2026-07-16T00:00:00.000Z
decided: 2026-07-17T00:00:00.000Z
decided_by: neco
source_session: lictor-9747bcfe-3969-4e12-959d-6cf39d3287fc
memoria_task_id: 534
actio_task_id: null
memory_links:
  - E:/Document/Ars/Calliope/docs/design/glab-pm.md
  - E:/Document/Ars/GLAB/DESIGN.md
  - E:/Document/Ars/GLAB/spec/faq/glab-pm-task-source.md
---
# 設計相談: GLAB 学生 PJ のタスク正本・velocity ソース・自律性境界

## 目的

Calliope×GLAB PM 連携 (Calliope docs/design/glab-pm.md §H1) の前提裁定。
実装 (GLAB projects プラグイン以降) の仕様を確定させる。**裁定者は neco。**

## 検討事項 (glab-pm.md §H1 の 3 点)

1. **学生 PJ のタスク正本の置き場** — (a) Actio 本体 project scope / (b) Actio-SchoolModules /
   (c) GLAB 自前 SQLite。MUSA 原則 (タスクエンジンを二重実装しない) からは (a)/(b) が本線。
   学生認証は Cernere 前提 (GLAB は Cernere user_id 参照のみ保持)。
2. **velocity ソース** — 学生 PJ は人間作業で Memoria agent_runs (AI 実績) が使えない。
   タスク完了実績ベース / 見積り申告ベースのどちらを sprint エンジンに注入するか。
3. **自律性境界** — 学生 PJ への Calliope 書込 (タスク生成・リスケ) の承認者を
   運営者のみとするか、PJ リーダー承認を挟むか。

## 完了条件

- 3 点の比較 (decision-metrics 4 軸: AI 学習量 / 作業コスト / 目的達成度 / 主目的一致度) を
  まとめた提案を本 md に追記し、ユーザ (neco) へメンションで裁定を仰ぐ。 → **完了**
- 裁定結果を本 md とCalliope docs/design/glab-pm.md §H1 に追記して確定させる。 → **本 md 完了 / Calliope 側は別 PR**
- コードは書かない (設計相談)。 → **遵守**

## スコープ (編集可ディレクトリ)

- spec/tasks/ (本ファイルへの追記)
- (参照のみ: E:/Document/Ars/Actio, E:/Document/Ars/Actio-SchoolModules, E:/Document/Ars/Calliope)

---

## 裁定結果 (2026-07-17 / 裁定者 neco) — **確定**

調査・比較・影響範囲の全文は [`spec/faq/glab-pm-task-source.md`](../faq/glab-pm-task-source.md)
(kind: design)。以下は要約。

### 前提の訂正 (調査で判明した事実)

§H1 の選択肢の前提のうち 2 つが実装と食い違っていた:

- **(a)「Actio 本体の project scope」は実在しなかった。** Actio コア `tasks`
  (`Actio/src/db/schema.ts:1076-1129`) に `project_id` は無く、分離軸は
  `owner_id`/`assignee_id`/`group_id`/`plugin_id`。Actio の語彙では **project ≒ group**。
  `project_id` を持つ `pm_tasks` は GitHub/Notion 同期専用の別系統。
- **(b) Actio-SchoolModules はタスクモデルを持たない。** 実体はプラグイン 1 個
  (`curriculum-scheduler`)、所有テーブルは取り込み履歴 1 本のみ。

### 裁定

| 論点 | 裁定 |
|---|---|
| 1. タスク正本 | **Actio コア `tasks` に `project_id` を新設**する (既存 `group_id` での代用はしない)。実装は Actio に置き、**操作は GLAB フロントエンドの簡易 UI で完結**させる (学生は Actio の UI を触らない) |
| 2. velocity | **完了実績ベース throughput のみ** (`kFactor=1.0` 固定 + `source` 明示)。`estimated_minutes` の学生必須化を**許容** |
| 3. 自律性 | **PJ リーダーに承認権を渡す**。承認者の身元は **GLAB `glab_project.leader_user_id` (Cernere `user_id`)** で解決し、所属は **Cernere `vantan_user` の所属プロジェクト**を参照 |
| 追加裁定 | **Actio のモジュールリポジトリは全廃止し Actio 本体に集約**する (→ Actio-SchoolModules は消滅。候補 (b) は選択肢としても無くなる) |

### 裁定に伴う当初提案からの変更

- **裁定 1**: 当初提案は「既存 `group_id` を PJ 軸に代用」(≈200 行) だったが、`project_id` を
  正面から新設する判断に。また「操作は GLAB 簡易 UI で完結」により、external-api `tasks` scope は
  **read-only では足りず read+write が必要**になった。計 ≈650 行 / 3 リポ。
- **裁定 3**: 当初提案は「運営者のみ」だった。理由は「承認 API に認証が無く Discord↔Cernere も
  未突合のため**リーダー本人性を証明する経路が無い**」。裁定で示された
  `glab_project.leader_user_id` (Cernere `user_id`) + Cernere `vantan_user` 所属 PJ の構成が
  この穴を塞いだため、リーダー承認が成立する。

### 本記録が置いた読み (違えば訂正が要る)

- `tasks.project_id` の値は **GLAB `glab_project.id`**。PJ レジストリ正本は GLAB のままで
  Actio 側に project マスタは作らない → Calliope の `projectRef = glab:<project_id>` と自然に一致。
- 承認経路は **GLAB Web hub 限定** (Cernere PASETO 認証済み)。Discord↔Cernere 突合は未着手
  (GLAB DESIGN.md §8) のままなので **Discord からの承認は不可**。

### 実装の必須前提 (飛ばすと裁定が成立しない)

- **裁定 2**: `estimated_minutes` が空だと `throughput=0` → `SprintPrerequisiteError(['velocity'])`
  で sprint が立たない。GLAB 簡易 UI で必須入力にする。立ち上げ期用に運営者の暫定 throughput
  手入力口 (`source: 'operator_seed'`) を用意する。
- **裁定 3**: **`POST /api/confirmations/:id` への認証導入が必須**。現状 `decidedBy` は
  認証なしの自由文字列 (`Calliope/src/routes/confirmations.ts:14`) で、このままだと
  誰でも `{decidedBy:"リーダーの名前"}` を POST でき承認が名前だけになる。

## 後続タスク (裁定の帰結)

- **Actio** (本連携の最長依存): ① `tasks.project_id` 新設 + index、
  ② external-api `tasks` scope (read+write)、③ モジュールリポジトリの本体集約。
- **Cernere**: `vantan_user` に所属プロジェクト + `data_sharing` 範囲更新。
- **Calliope**: 承認 API の認証導入、`confirmation` に `projectRef`+`approverRole`、
  `priority.scope` enum に `glab`、`makeStudentVelocitySource`、`src/clients/glab.ts`。
- **GLAB**: `02-projects-plugin` は**スコープ拡大** (`leader_user_id` + 簡易タスク UI)。
  `03-progress-panel` にリーダー承認 UI が乗る。
- **Calliope 側 doc**: `docs/design/glab-pm.md` §H1 への裁定追記は**別 PR** (別リポのため)。

## 残課題

- **リーダーと所属の整合性** — リーダー指名は GLAB、所属は Cernere に分かれるため
  「所属していない者がリーダーに指名されている」状態が構造的に作れる。整合性検証をどこで行うかは
  projects プラグイン実装時に決める。
- **Discord からの承認** — 不可のまま。Discord↔Cernere 突合 (GLAB DESIGN.md §8) 実装後に再検討。
