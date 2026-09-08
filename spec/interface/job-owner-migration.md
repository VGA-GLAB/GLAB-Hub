# 求人 owner 移行と管理操作

`posted_by` は表示履歴、`owner_user_id` は認可主体、`owner_revision` はCAS世代。
schema追加は旧行をnullable owner/revision0に保ち、起動時の自動backfillは行わない。
新規Web投稿は本人user IDをownerへ保存する。募集終了はownerまたはadminだけで、判定時revisionもUPDATE条件に含める。

管理者だけが GET `/api/x/jobs/owner-migration` で分類、PUT `/:id/owner` で確認済みowner変更、
POST `/owner-migration/rollback` で監査IDに基づくrollbackを行える。
bodyはoperationId、expectedOwner、expectedRevision、ownerUserId、evidenceKind、evidenceRef。
actorはHTTP認証identityから取得し、bodyでは指定させない。監査テーブルのUPDATE/DELETEはtriggerで拒否する。
Discord suffixはexact_user_idより先に除外。名前・表示名一致から本人を推定しない。
同じoperationId/入力の再送はapplied:false。別入力の同ID再利用、古いowner/revisionは409。
rollbackもrevisionを増やし、後続変更やABAを上書きしない。schema更新と監査追加はsavepointで原子的に行う。

## 運用 CLI

Node 22.5以上の環境で `node --import tsx scripts/job-owner-migration.ts` に次の引数を渡す。
DB pathを明示し、classify/dry-runはreadOnlyで開く。存在しないDBや不完全schemaは拒否する。

```text
classify DB
dry-run DB reviewed-input.json
apply DB reviewed-input.json ACTOR --approved
rollback DB rollback-input.json ACTOR --approved
```

dry-runは分類とCAS照合を表示するだけで、本人証跡の確認完了を意味しない。
apply入力は管理者確認済みの配列、rollback入力は `{auditId, operationId}` の配列。
各行は独立したtransaction。結果はoperationId/auditId/revisionを照合し、失敗行があればexit code 1。
同じ入力の安全な再送は可能だが、途中成功のある結果を全失敗として一括rollbackしない。
CLI actorは運用担当者の明示入力なので、実施記録とアクセス権のある運用端末でのみ使用する。

今回、実DBのschema配備・分類・dry-run・更新は実行していない。配備と証跡の確認前にapplyしない。
