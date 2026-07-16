---
task: 01-pm-task-source
project: GLAB
kind: 設計相談
status: delegated
delegation_run_id: 14f09b4b-4518-444b-956e-a815896b236e
created: 2026-07-16T00:00:00.000Z
source_session: lictor-9747bcfe-3969-4e12-959d-6cf39d3287fc
memoria_task_id: 534
actio_task_id: null
memory_links:
  - E:/Document/Ars/Calliope/docs/design/glab-pm.md
  - E:/Document/Ars/GLAB/DESIGN.md
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
  まとめた提案を本 md に追記し、ユーザ (neco) へメンションで裁定を仰ぐ。
- 裁定結果を本 md とCalliope docs/design/glab-pm.md §H1 に追記して確定させる。
- コードは書かない (設計相談)。

## スコープ (編集可ディレクトリ)

- spec/tasks/ (本ファイルへの追記)
- (参照のみ: E:/Document/Ars/Actio, E:/Document/Ars/Actio-SchoolModules, E:/Document/Ars/Calliope)

---

## 提案 (2026-07-17 / delegation 14f09b4b) — **裁定待ち**

比較・根拠の全文は [`spec/faq/glab-pm-task-source.md`](../faq/glab-pm-task-source.md) (kind: design)。
以下は要約。**裁定者は neco。本セッションでは確定させていない。**

### 前提の訂正 (調査で判明した事実)

§H1 の選択肢の前提のうち 2 つが実装と食い違っていた:

- **(a)「Actio 本体の project scope」は実在しない。** Actio コア `tasks` (`Actio/src/db/schema.ts:1076-1129`)
  に `project_id` は無く、分離軸は `owner_id`/`assignee_id`/`group_id`/`plugin_id`。
  Actio の語彙では **project ≒ group**。`project_id` を持つ `pm_tasks` は GitHub/Notion 同期専用の別系統。
- **(b) Actio-SchoolModules はタスクモデルを持たない。** 実体はプラグイン 1 個 (`curriculum-scheduler`)、
  所有テーブルは取り込み履歴 1 本のみ。本番経路は本体 `ctx.modules.invoke` が Phase 2 未実装で塞がっている。

### 3 論点の提案 (decision-metrics 4 軸)

| 論点 | 提案 | (1) AI 負荷 | (2) 作業コスト | (3) 解決度 | (4) 一致度 |
|---|---|---|---|---|---|
| 1. タスク正本 | **(a') Actio コア `tasks` + `group_id` を PJ 軸** (+ external-api に `tasks` scope 追加) | 3 | ≈200 行 / 2 リポ | 5 | 5 |
| 2. velocity | **(i) 完了実績ベース throughput のみ / `kFactor=1.0` 固定 + `source` 明示** | 2 | ≈100 行 / 1 リポ | 4 | 5 |
| 3. 自律性 | **(A) 運営者のみ + 前方互換スロット** (`glab:*` は auto-apply 対象外) | 2 | ≈70 行 | 4 | 5 |

却下案と理由 (低かった軸):

- 1-(b) 一致度 2 — タスクドメインですらない + 他リポのブロッカー依存 (≈600 行 + 外部依存)
- 1-(c) GLAB 自前 SQLite: **一致度 1** — MUSA 違反 (タスクエンジン二重実装)
- 2-(ii) 実測時間の自己申告: 一致度 2 — 学生の入力習慣に賭ける。未入力＝サンプル 0 で (i) 以下に劣化
- 2-(iv) agent_runs 流用: **不可** — `velocity/engine.ts:42` が `creatorType !== 'ai'` を全捨てする
- 3-(B) PJ リーダー承認: 解決度 3 — 承認 API `decidedBy` が**認証なしの自由文字列**
  (`routes/confirmations.ts:14`) + Discord↔Cernere 未突合 (GLAB DESIGN.md §8) のため**承認として機能しない**
- 3-(C) auto-apply 許可: **一致度 1** — 他人の計画の無断改変

### 主要な論拠

- **論点 2 の鍵**: sprint の capacity は `throughput` **しか**使わない (`Calliope/src/sprint/capacity.ts:45`)。
  `throughput = Σestimate / windowDays` なので **実測時間なしで成立する**。人間作業に `actual` が無くても
  sprint は立つ。`kFactor` は capacity に入らないので 1.0 固定の実害は task_estimate 補正の精度のみ。
- **注入点**: sprint は `repo.listLatestVelocity()` (`sprint/engine.ts:177`) 経由で velocity テーブルの行しか
  見ない → 別 source が行を書けば **sprint エンジンは無改修**。
- **論点 1 の副産物**: `projectRef` は型なし text なので `glab:<project_id>` は素通る →
  Calliope `refs.ts` は**無改修**。migration は `priority.scope` enum のみ。

### neco へ確認したい点 (裁定に含めたい)

1. **(a') は Actio 側の作業 (external-api `tasks` scope 追加) を必ず伴う。**
   これを GLAB/Calliope スコープ外タスクとして起票してよいか。**本連携の最長依存。**
2. **論点 2 は `estimated_minutes` の学生必須化を伴う。** 運用として受容可能か
   (未設定だと `throughput=0` → `SprintPrerequisiteError(['velocity'])` で sprint が立たない)。
3. **論点 3 は「PJ リーダーに承認権を渡さない」判断。** 当面リーダーは read + 意見表明まで。
   前提 (承認 API の認証 / Discord↔Cernere 突合 / leader 運用実績) が揃えば (B) へ再裁定。

### 裁定後にやること

- 裁定結果を本 md と `Calliope/docs/design/glab-pm.md` §H1 に追記して確定させる。
- 下流タスク (02-projects-plugin / Calliope 04-glab-client / 05-glab-sprint-progress) のスコープを更新。
