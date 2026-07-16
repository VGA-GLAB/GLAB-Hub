---
task: 01-pm-task-source
project: GLAB
kind: 設計相談
status: done
delegation_run_id: bbcbf07e-b97c-4a7c-85d0-1080e1e95196
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

## 提案 (2026-07-17, Fable)

裁定者: neco。以下は推奨案であり確定ではない。各論点末尾に「残論点」を明示する。
評価は decision-metrics 4 軸 (1=AI 負荷 / 2=作業コスト定量 / 3=目的達成度 / 4=主目的一致度)。

### 前提事実 (実態確認の結果)

- **Actio core `tasks`** は `groupId`(グループタスク) / `assigneeId` / `deadline` /
  `estimatedMinutes` / `completedAt` / `creatorType` / `kind` / `category` を既に持つ
  (`Actio/src/db/schema.ts` tasks)。グループ機構 (`modules/group/`) と Cernere 認証も既存。
  Calliope の参照正規形 `actio:<taskId>` はこのテーブルを指す。
- **Actio `pm_projects`** は `source: "github" | "notion"` が NOT NULL で外部同期前提
  (`Actio/src/db/pm-schema.ts`)。依存 (`blockedBy`)・milestone・gompertz 分析は pm 側にのみある。
- **Actio-SchoolModules の実態** は `@ludiars/schedula-module-curriculum-scheduler` —
  **Schedula (予定軸) プラグイン**で、Calicula カリキュラムを MyPlan に展開するもの。
  タスク概念もプロジェクト概念も**存在しない** (manifest / spec/module-scope.md)。
  さらに Actio 方針転換 (2026-05-20) で school 系は Schedula へ移す側であり、
  タスク正本を置く先として軸が違う。
- **Calliope velocity** は 2 成分: `k_p = median(実所要 D_t / 見積り E_t)` (要 Memoria
  agent_runs の実所要) と `Θ_p = Σ E_t(完了) / 日` (E 単位スループット。**completedAt と
  E_t だけで算出可能**)。sprint の scope 判定は Θ_p (E 単位) を使う設計
  (scheduling.md §2.3, §6)。`velocity` テーブルは `出典` (source) 列を既に持つ。
- **Calliope 自律性** は 低リスク auto-apply / 高リスク 409 confirmation + 承認キュー
  (DESIGN.md §6, pm-extensions F1)。glab-pm.md §H4 は学生 PJ の書込系を
  「既定 confirmation 経由のみ」と既に規定。

### 論点 1: 学生 PJ のタスク正本の置き場

| 案 | (1) AI 負荷 | (2) 工数 | (3) 解決度 | (4) 一致度 | 採用? |
|----|------------|---------|-----------|-----------|--------|
| (a1) Actio core tasks + group (PJ=Actio group) | 2 | GLAB 側 ~150 行 (projects plugin に actio_group_id 連携) + Calliope ~50 行 (group read)。**Actio 本体改修 0 行** | 4 | 5 | ◎ |
| (a2) Actio pm module に `source='local'` 追加 | 3 | Actio 改修 ~300 行 (sync 前提の解除 + UI) + 連携 ~200 行 | 5 | 4 | 保留 (拡張先) |
| (b) Actio-SchoolModules | 4 | タスクエンジン新規 ~1000 行 + Calliope 新コネクタ ~200 行 | 2 | 1 | × |
| (c) GLAB 自前 SQLite | 3 | GLAB に task schema/API/UI ~800 行 + Calliope 新コネクタ ~200 行 | 3 | 1 | × |

- (b) ×: 実態が Schedula 予定軸プラグインでタスク概念が無く、置くなら新規タスクエンジン実装
  = MUSA 違反。リポ名からの連想と実態が乖離している (curriculum-scheduler)。
- (c) ×: MUSA 原則 (タスクエンジン二重実装禁止) に正面から反する。GLAB DESIGN も SQLite を
  出席/Bot 求人ローカルデータに限定しており、データ境界も崩す。
- (a2) は依存関係・milestone・gompertz が付くが、pm module は外部同期エンジン前提
  (source NOT NULL) の解除が必要で v0.1 には過剰。

**推奨: (a1)** — 学生 PJ 1 件 = Actio group 1 件。タスクは core `tasks` (groupId 付き) を正本とし、
GLAB `glab_project` に `actio_group_id` を持たせてリンクする (レジストリ正本 = GLAB、
タスク正本 = Actio、認証 = Cernere で全て既存境界のまま)。Calliope は
`glab:<project_id>` scope → actio_group_id 経由で ActioConnector read。

残論点 (neco 裁定):
- R1-1. メンバー名簿の同期方向 — GLAB `glab_project_member` を正本とし Actio group member へ
  片方向同期 (推奨) か、Actio group を名簿正本に昇格させるか。
- R1-2. 依存関係/milestone が必要になった時点で (a2) local pm source へ拡張するか、
  core tasks に blockedBy を足すか (Actio 側の設計判断)。v0.1 では不要と判断。

### 論点 2: velocity ソース

| 案 | (1) AI 負荷 | (2) 工数 | (3) 解決度 | (4) 一致度 | 採用? |
|----|------------|---------|-----------|-----------|--------|
| (i) タスク完了実績のみ (E_t は全件 EstimationService 推定) | 3 | ~80 行 | 3 | 4 | △ |
| (ii) 見積り申告のみ (実績補正なし) | 1 | ~40 行 | 2 | 2 | × |
| (iii) ハイブリッド: E_t=申告 (欠損は analogy→LLM 補完) + velocity=完了実績 Θ_p、k_p 非適用 | 2 | ~100 行 (velocity source 追加 + k_p 縮退分岐 + 縮退ログ) | 5 | 5 | ◎ |

- (ii) ×: 学生の見積りは精度が低い前提で、実績フィードバックが無いと sprint 逸脱検知
  (velocity ドリフト) が機能せず、PM 秘書の主目的 (進捗の実態把握) から外れる。
- (i) △: 申告というシグナルを捨てて LLM 推定に置き換えるのは逆転。申告は教育的にも
  一次ソースにすべき。

**推奨: (iii)** — sprint エンジンの scope 判定は元々 Θ_p (E 単位、completedAt + E_t のみで
算出可) を使う設計なので、**人間作業でもタスク完了実績ベースの Θ_p はそのまま成立する**。
- E_t = 学生の見積り申告 (`estimate_source='human'`)。欠損は既存 EstimationService
  (analogy→LLM) で補完 — 既存機構の再利用でエンジン改変なし。
- velocity = 週次 Θ_p (完了タスクの E_t 合計 / 日)。`velocity.出典` に
  `glab_completion` 等を立てて注入 = **データ注入のみ、エンジン二重化なし**。
- k_p (wall-clock 補正) は agent_runs 相当の実所要が学生 PJ には無いため**非適用**
  (k=1 固定 + 広信頼帯 + 「暫定」表示)。glab-pm.md §H4 の縮退モード規定どおり
  明示ログ + レポート表記 (無言フォールバック禁止)。
- AI 並列レーン配置 (能力 A の C レーン) は学生 PJ に適用しない。適用するのは
  sprint scope 確定 + burndown + 逸脱検知のみ。

残論点 (neco 裁定):
- R2-1. Θ_p の集計窓 (週次 rolling を推奨) と cold-start 時の初期スプリント容量の置き方
  (最初の 1 sprint は申告合計をそのまま容量とし「暫定」表示、で良いか)。
- R2-2. 学生の実所要申告 (作業時間の自己申告) を将来追加して k_p 相当を復活させるか。
  v0.1 では申告負荷が高いため非推奨。

### 論点 3: 自律性境界 (Calliope 発の書込の承認者)

| 案 | (1) AI 負荷 | (2) 工数 | (3) 解決度 | (4) 一致度 | 採用? |
|----|------------|---------|-----------|-----------|--------|
| (i) 運営者のみ (既存 confirmation キュー) | 1 | ~20 行 (scope フィルタのみ) | 4 | 4 | ◎ (v0.1) |
| (ii) PJ リーダー承認を挟む (2 段) | 3 | GLAB 承認 UI ~200 行 + Calliope 2 段承認 ~150 行 + role 解決 ~80 行 | 5 | 3 | 保留 (follow-up) |
| (iii) auto-apply 許可 (低リスクのみ) | 1 | 0 行 | 2 | 1 | × |

- (iii) ×: 学生 PJ への書込は「人間の作業予定を動かす」ため、Calliope 本体の
  低リスク定義 (自 PJ 内 AI 作業の順序変更) が当てはまらない。**学生 PJ では
  auto-apply を全面禁止**し、全書込を confirmation 扱いにする。
- (ii) は学生の当事者性 (教育目的) では最良だが、read-only 設計の GLAB progress パネル
  (§H5) に書込 UI を足し、Calliope に承認者認可モデル (glab_project_member role 解決) を
  足すスコープ膨張。v0.1 で必要になる根拠がまだ無い。

**推奨: (i) で開始し、(ii) へ拡張可能な形にする** —
- v0.1: 承認者 = 運営者のみ。既存 confirmation キュー (`GET/POST /api/confirmations`) を
  そのまま使い、Calliope UI (運営者向け) で裁定。
- 拡張準備: confirmation payload に `project_id` と対象 PJ のリーダー user_id を含めて
  永続化しておく (これだけで後からリーダー承認段を追加しても過去データと互換)。
- 学生の自律性は損なわれない: タスク自体の作成・編集は学生が Actio (group タスク) で
  直接行える。ゲートするのは **Calliope 発** のタスク生成・リスケ適用だけ。

残論点 (neco 裁定):
- R3-1. リーダー承認段 (ii) を追加する条件 — 運用開始後、運営者の裁定件数が負荷になった
  時点か、教育効果を狙って最初から入れるか。
- R3-2. 運営者 = 誰か (Cernere role / GLAB isAdmin のどちらで判定するか)。

### 裁定依頼

@neco 上記 3 点 (推奨: 論点1=(a1) / 論点2=(iii) / 論点3=(i)+拡張準備) と
残論点 R1-1〜R3-2 の裁定をお願いします。確定後、本 md と
Calliope docs/design/glab-pm.md §H1 に裁定結果を追記して close します。

## 裁定 (2026-07-17, neco)

- **本線 3 点は推奨どおり承認**:
  - 論点1 = **(a1)** 学生 PJ のタスク正本は Actio core tasks + group (PJ 1 件 = Actio group 1 件、
    GLAB `glab_project.actio_group_id` でリンク)。
  - 論点2 = **(iii)** ハイブリッド velocity (E_t = 学生申告 + EstimationService 補完、
    velocity = 完了実績 Θ_p、k_p 非適用・縮退明示)。
  - 論点3 = **(i)** 承認者は v0.1 運営者のみ + auto-apply 全面禁止 + リーダー承認への拡張準備
    (payload に project_id / リーダー user_id を保持)。
- **残論点の個別裁定 (2026-07-17, neco)**:
  - **R1-1**: 推奨どおり — GLAB `glab_project_member` を正本とし、Actio group member へ片方向同期。
  - **R1-2**: **案 C (先送り)** — 依存関係/milestone が必要になった時点で改めて設計相談。
    補足 (neco): Actio にスケジュールを統合する予定はある (将来の拡張はその文脈で再検討)。
  - **R2-1**: 承認 — Θ_p は週次 rolling 窓。cold-start は最初の 1 sprint を学生申告合計の容量 +
    「暫定」表示で開始。
  - **R2-2**: 実所要の自己申告は**導入しない**。実所要が必要な場合もシステムの自動計算
    (タスクの状態遷移タイムスタンプ等) に限る。
  - **R3-1**: **最初から裁量を持たせる** — リーダー承認段を v0.1 から導入する
    (運営者負荷を待たない)。
  - **R3-2**: 承認ゲートの対象は**リスケ適用とプロジェクトスコープ判断のみ**。
    承認者は**プロデューサーと総合ディレクターのみ**。
    (実装解釈: プロデューサー = `glab_project_member.role` の PJ 単位ロール、
    総合ディレクター = GLAB hub 全体ロール。いずれも Cernere user_id 参照で保持。
    タスク生成候補などその他の Calliope 発書込も auto-apply 禁止は維持し、
    同じ 2 ロールの confirmation に載せる。)

**本タスクは close (done)。** 裁定結果は Calliope docs/design/glab-pm.md §H1 にも反映済み。
