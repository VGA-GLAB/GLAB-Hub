# interface/ — projects（学生ゲーム制作 PJ レジストリ）

Calliope `docs/design/glab-pm.md` §H2 の実装。`projects` モジュール（`plugins/projects/`）が
GLAB を学生ゲーム制作プロジェクトの名簿・メンバー・リポ参照の**正本**として持つ。

Actio コア `tasks.project_id`（`Actio/spec/tasks/2026-07-17-01-glab-project-tasks.md`）は
ここで発行する `glab_project.id` を不透明参照するだけで、Actio 側に project マスタは
複製しない（`GLAB/spec/tasks/2026-07-16-01-pm-task-source.md` 最終裁定）。

## データ（`plugins/data.ts`）

- `glab_project`: `id`（UUID、`crypto.randomUUID()`）/ `name` / `description?` /
  `status`（`active` | `paused` | `closed`）/ `repo_url?` / `created_at` / `updated_at`。
- `glab_project_member`: `project_id` / `user_id`（Cernere 参照。**個人属性は保持しない**、
  Cernere `vantan_user` が単一情報源）/ `role`（`producer` | `member`）/ `created_at`。
  主キーは `(project_id, user_id)`。
- 表示名は `glab_project_member` に持たず、Corpus `server/db.ts` の
  display-name キャッシュ（`getDisplayName`、vantan-user / attendance と共有）を都度引く。
- Actio へのリンク列は持たない（参照は Actio → GLAB の一方向。最終裁定どおり）。

## パネル API（ブラウザ、Cernere 認証 = Corpus `requireAuth` 配下）

`ctx.api(path)` は `/api/x/projects<path>` を叩く。

| メソッド | パス | 認可 | 内容 |
|---|---|---|---|
| GET | `/projects` | 認証済み全員 | 一覧（`?status=active\|paused\|closed` で絞込）。各要素に `members[]` を含む |
| GET | `/projects/:id` | 認証済み全員 | 詳細 + メンバー |
| GET | `/projects/:id/analysis-summary` | 認証済み全員 | 検証済み `report/omnipotens-summary.json` と最終レポートURL |
| GET | `/projects/:id/analysis-files/omnipotens-final.html` | 認証済み全員 | Omnipotens最終HTML |
| GET | `/projects/:id/analysis-files/stages/:file.html` | 認証済み全員 | 最終HTMLから参照する工程別HTML |
| POST | `/projects` | admin | 新規登録 `{name, description?, repoUrl?}` |
| PATCH | `/projects/:id` | admin | 部分更新 `{name?, description?, status?, repoUrl?}` |
| PUT | `/projects/:id/members/:userId` | admin | メンバー割当/役割変更 `{role: 'producer'\|'member'}`（upsert） |
| DELETE | `/projects/:id/members/:userId` | admin | メンバー解除 |
| GET | `/known-users` | admin | 割当候補（既存 `glab_user` + 表示名キャッシュ。個人データを新規保持しない） |

admin 判定は Corpus 既存の `requireAdmin`（Cernere `role`/`CORPUS_ADMIN_IDS` 由来）をそのまま
流用する（「総合ディレクター」に新規ロール機構を作らない、`2026-07-16-02-projects-plugin.md`
の指示どおり）。「プロデューサー」は PJ 単位ロールとして `glab_project_member.role` に持つ。

v0.1 は運営者 (admin) のみが登録・編集・メンバー割当を行う。学生本人によるプロデューサー
自己編集は follow-up（`pm-task-source.md` R3 系の"学生の裁量"は **タスク**操作の話であり、
レジストリ自体の書込権限は別軸）。

## Omnipotens解析レポート

GLabの「レビュー」パネルではプロジェクト名を選択し、Omnipotensの解析サマリと最終HTMLを閲覧できる。プロジェクト管理パネルには重複表示しない。HTMLを解析して値を推測せず、Omnipotensが検証・正規化した `report/omnipotens-summary.json` を唯一のサマリ入力とする。

サマリ契約第3版では、偏差値50程度の一般読者・高校生向け統合サマリを表示し、総合評価と各項目のまとめを先に置く。「各レイヤでの解析データは以下」という境界の後に、遊びの構造3軸（発想・構造・量産性）、UXの2軸（体験設計と実装の方向一致・表現の納得性／パフォーマンス）、AI Format、Vitia、Ludus新規性をスコアとともに表示する。各スコアの平均的改善提案は `improve` または `hold` を明示し、UXの大衆評価は実測値ではないAI平均反応シミュレーションとして前提と限界も表示する。

`GLAB_OMNIPOTENS_REVIEW_ROOT` はOmnipotentsの`Review`フォルダだけを指定する。読取先は登録済み `repo_url` のリポジトリ名（無い場合はプロジェクト名）から `Review/<project name>/report` を決定し、任意パス、`..`、シンボリックリンク／ジャンクション、ルート外の実体、想定外のファイル種別を拒否する。未設定は503、未生成は404、契約不正は422を返す。

## 外部サービス向け read API（service token 認可）

設計文書 (`glab-pm.md` §H2) は `GET /api/glab/projects` と表記するが、実際に到達可能な
パスは **`GET /api/x/projects/external/projects`**（一覧）/
**`GET /api/x/projects/external/projects/:id`**（詳細）になる。理由:

- Corpus は `app.use('/api/*', requireAuth)` を **`/api/*` 全体**に、プラグインの
  ルート mount（`registry.mountRoutes(app)`）より前に適用しており（`corpus/server/index.ts`）、
  プラグイン側 (`CorpusContext.registerRoute`) は `/api/x/<moduleId>` 配下にしか
  ルートを追加できない。`corpus/` submodule は変更禁止のスコープのため、
  `/api/*` の外や `requireAuth` の手前にルートを増設する手段がない。
- そのため本タスクでは、requireAuth の**内側**に service token による追加ゲート
  (`plugins/projects/service-auth.ts` の `requireServiceToken`) を重ねる形で実装する。
  呼び出し側 (Calliope) は Cernere で検証可能な bearer（他コネクタと同じ経路）に加えて、
  以下のいずれかの header で service token を提示する:
  - `X-Glab-Service-Token: <token>`
  - `Authorization: Bearer <token>`（Cernere 検証を経ないその他クライアント向け）
- token は env `GLAB_PROJECTS_SERVICE_TOKEN` で設定する（Excubitor spawn env / Infisical）。
  **未設定時は `503 { error: 'service_token_unconfigured' }`**（無言で全許可・全拒否のどちらにも
  倒さない、§7.1）。token 不一致 / 未提示は `401 { error: 'invalid_service_token' }`。
  比較は `crypto.timingSafeEqual`（平文比較しない）。
- レスポンス形式はパネル API の GET と同一（`{ projects: [...] }` / `{ project: {...} }`）。

Calliope 側 (`H3 GLabConnector`) が実装時に Cernere 認証をどう満たすか（project token 発行の
有無）は本タスクのスコープ外。上記の「実際の到達パス + 二重ゲート」を Calliope 側実装の
前提として参照すること。

## 関連

- 設計: `Calliope/docs/design/glab-pm.md` §H1（最終裁定）/ §H2
- タスク: `spec/tasks/2026-07-16-01-pm-task-source.md`（設計相談・最終裁定）/
  `spec/tasks/2026-07-16-02-projects-plugin.md`（本実装）
- コード: `plugins/projects/index.ts` / `plugins/projects/panel.ts` /
  `plugins/projects/service-auth.ts` / `plugins/data.ts`
