# プロフィール登録の案内が消えない

- Date: 2026-11-13
- Status: GLAB 側の修正を提出。反映 (GLAB 再起動) 待ち
- Area: GLAB / Cernere user_data 宣言

## 症状

GLab を開くと「プロフィールの登録」(plugins/panel-kit.ts `requireVantanUserRegistration`) が出続ける。
Cernere で入力しても、「ログインし直して登録する」で再ログインしても消えない
(neco 2026-11-12「プロフィール設定しろってのが永遠に出続けるバグ」)。
807ac93 (profile 提供を拒否した人を Cernere の権限画面へ案内) は拒否した人の経路だけを直したもので、この症状は残っていた。

## 原因

GLAB は起動時 (と presence 操作の前) に `managed_project.update_schema` で user_data を宣言する。
この宣言は列の全置換で、Cernere `updateProjectSchema` は宣言に無い旧列を DROP せず `_deleted: true` にする。
GLAB の宣言は presence の 3 列 (current_location / available_now / available_until) だけだったので、
Cernere migration 078 / 079 で glab に入ったプロフィール列 (name / role_title / member_type / nickname /
department_name / grade / company / desired_job) が GLAB の起動のたびに論理削除されていた。

- GLAB の読み出し (`get_user_data` → Cernere `getUserColumns`) は論理削除された列を返さないので、常に「未登録」になる。
- Cernere のログイン時入力 (`signup-fields/requirement.ts`) と権限画面は論理削除された列を聞かないので、
  再ログインしても入力画面が出ない。

この 2 つが重なって、案内が出続けるのに入力する場所が無い状態になっていた。値そのものは
`project_data_glab` に残っている (論理削除は定義のフラグだけで、列も値も消さない)。

## 修正

宣言する列を GLAB の user_data 全列 (`plugins/cernere/user-data-columns.ts` = profile + presence) にした。
profile 列の定義は Cernere `service/glab/schema.json` と同じ (`plugins/cernere/profile-columns.ts`)。
次の GLAB 起動の宣言で論理削除が外れ、既存の値がそのまま読めるようになる。

## 再発防止

- glab の user_data に列を足すときは `user-data-columns.ts` に加える。Cernere の migration だけで足すと、
  GLAB の次の起動で論理削除される。
- `tests/cernere-user-data-declaration.test.ts` が、Cernere の全置換と論理削除を再現して、
  GLAB が読むプロフィール列が宣言後も有効であることを確かめる。
