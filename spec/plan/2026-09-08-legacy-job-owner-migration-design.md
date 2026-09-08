# 旧 Discord 求人の所有者移行設計

## 決定

`glab_job.posted_by` は表示用の履歴として維持し、認可用に nullable `owner_user_id` と
`owner_revision INTEGER NOT NULL DEFAULT 0` を追加して Cernere user ID と所有権世代を格納する。
新規 Web 求人は両方を書き、close は `owner_user_id === getIdentity(c).userId` または管理者だけを許可する。
旧 Discord 求人の `${interaction.user.username} (discord)` は変更可能な名前であり、Cr ID を自動推定しない。

| 既存行 | migration |
|---|---|
| `posted_by` が既存 `glab_user.user_id` と完全一致 | dry-run 対象を提示後、機械 backfill 可 |
| `(discord)` suffix | 自動更新禁止。管理者または本人連携で個別確認 |
| その他、曖昧、重複 | 未解決のまま維持し、管理者だけ close 可 |

本人連携は認証済み claimant、対象 job、確認済み Discord account ID、根拠を管理者が照合する。username 一致や名簿の
表示名だけを根拠にしない。`glab_job_owner_migration` に job ID、変更前後 owner、evidence kind/ref、actor、時刻を追記し、
同じ job の再適用は冪等にする。rollback は監査行を根拠に owner を直前値へ戻し、新しい監査行として残す。

## 移行手順と受入

schema/API/UIを先に配備し、新規 write を canonical owner へ切替後、dry-run CSV、管理者承認、確定更新の順に行う。
dry-run は次の read-only SQL で suffix を先に除外し、`exact_user_id`、`discord_name`、`unmatched` に分類する。曖昧性は
その後の証跡照合で別に判定する。

```sql
SELECT j.id,
  CASE WHEN j.posted_by LIKE '% (discord)' THEN 'discord_name'
       WHEN EXISTS (SELECT 1 FROM glab_user u WHERE u.user_id = j.posted_by) THEN 'exact_user_id'
       ELSE 'unmatched' END AS bucket
FROM glab_job j;
```

更新は読取時の `owner_user_id` と `owner_revision` を条件にした CAS とし、成功時に revision を increment する。rollback も
移行後の owner と revision の一致を条件に increment し、後続変更と ABA を上書きしない。
対象 scope は `plugins/data.ts`、`plugins/jobs/`、関連 spec と migration tool に限定する。更新中も unresolved row は消さず、
UI に「管理者へ依頼」を表示する。今回データ更新は行わない。

- Discord username から owner が自動付与されない。
- 新規求人は owner user ID で本人 close できる。
- unresolved 旧求人は一般利用者が close できず、管理者対応が可能である。
- 全変更と rollback の根拠が追跡できる。

## 参照

- `plugins/data.ts`
- `plugins/jobs/index.ts`
- `bot/commands/job.ts`
- `spec/plan/problem_logs/2026-09-08-discord-input-retirement.md`
