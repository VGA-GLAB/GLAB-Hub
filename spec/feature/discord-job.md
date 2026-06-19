# feature/ — Discord `/job` コマンド

## 目的・ユーザーストーリー

Discord 上で就活情報を**投稿・検索・クローズ**する。投稿は即 `#job` へ通知し、
Web hub の `jobs` モジュールと同一 DB を共有する（DESIGN §4）。

実装: `bot/commands/job.ts`。

## サブコマンド・オプション

| サブコマンド | オプション | 必須 | 振る舞い |
|---|---|---|---|
| `/job add` | `company`（企業名） | ○ | `createJob` → `formatJobCard` を `#job` へ投稿 |
| | `position`（募集 / 職種） | | |
| | `category`（業種, 例 ゲーム） | | |
| | `url`（URL） | | |
| | `deadline`（締切, 例 `2026-07-31`） | | `parseDateInput`、解釈不能なら締切なし |
| | `desc`（詳細） | | |
| `/job list` | `q`（企業 / 職種 / 本文の検索語） | | `status='open'` で `listJobs`、最大 8 件 ephemeral 表示 |
| | `category`（業種で絞る） | | |
| `/job close` | `id`（求人 ID, integer） | ○ | 投稿者 or admin のみ `closeJob` |

## 振る舞いの詳細

- `add`: `postedBy = "<username> (discord)"`。返信に求人 ID を含める。
- `close`: `isOwner = posted_by === "<username> (discord)"`、`isAdmin = adminUserIds.includes(user.id)`。
  権限がなければ ephemeral で拒否。求人未発見は ephemeral でエラー。
- 返信はすべて ephemeral。通知本体だけが `#job` に出る。

## 制約・前提

- 締切が近い求人の自動リマインドは通知スケジューラ（`bot/notify/scheduler.ts`）が行う。
- `adminUserIds` は Discord ユーザ ID（`GLAB_ADMIN_USER_IDS`）。

## 関連

- データ: [`data/glab-job.md`](../data/glab-job.md)
- 接点: [`interface/discord-commands.md`](../interface/discord-commands.md)
- 対の Web 機能: [`feature/jobs.md`](./jobs.md)
