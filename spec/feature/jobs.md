# feature/ — 就活情報管理（Web hub `jobs`）

## 目的・ユーザーストーリー

GLAB メンバーが**就活情報（企業 / 募集 / 締切 / URL）を Web hub で投稿・検索・クローズ**する。
投稿は Discord Bot の `/job` からも行え、締切が近い求人は Bot が `#job` へリマインドする
（同一 DB 共有、DESIGN §4）。GLAB **自前データ**機能。

## 振る舞い（入力 → 処理 → 出力）

`plugins/jobs/index.ts` が登録する hub ルート：

| メソッド・パス | 認可 | 振る舞い |
|---|---|---|
| `GET /`（`?status=open\|closed\|all`, `?category=`, `?q=`） | 認証ユーザ | `listJobs` を `jobView` 整形して `{ jobs: [...] }` |
| `POST /` | 認証ユーザ | `{company, position?, category?, url?, body?, deadlineAt?}` を検証して `createJob` |
| `POST /:id/close` | 投稿者 or admin | `getJob` 存在確認 → 権限確認 → `closeJob` |

- `company` 空は `422 company_required`。
- `deadlineAt` は数値（epoch ms）または文字列（`Date.parse`）。解釈不能なら `null` 扱い。
- `status` 既定は `open`。`q` は company / position / body の部分一致。
- ソートは締切が近い順（締切なしは末尾）→ 新しい順。

## 状態

`status`: `open` → `closed`（`close`）。`deadline_notified_at` は締切リマインド時に Bot が埋める。

## 関連

- データ: [`data/glab-job.md`](../data/glab-job.md)
- 接点: [`interface/corpus-db-shared.md`](../interface/corpus-db-shared.md)
- 対の Bot 機能: [`feature/discord-job.md`](./discord-job.md)
