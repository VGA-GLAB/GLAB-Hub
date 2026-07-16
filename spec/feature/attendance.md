# feature/ — 出席閲覧（Web hub `attendance`）

## 目的・ユーザーストーリー

GLAB メンバー / 管理者が、進行中イベントの**出席状況を Web hub で確認・管理**する。
`user_id` と現在の出席状況は GLAB の `glab_user` が真実の源となる。
名前・役職・学科は Cernere の `vantan_user` が正本であり GLAB に複製しない。

- メンバー: 会場Wi-Fi内のOsでpasskeyを検証し、進行中イベントへ出席したい。
- 管理者: 全員の現在状況を一覧し、出席 / 欠席 / 遅刻 / 公欠へ更新したい。

## 振る舞い（入力 → 処理 → 出力）

- 初回アクセス時に `ensureGlabUser` が Cernere `user_id` の参照行を冪等確保する。
- `GET /availability` は進行中イベントとOs `/api/health`を確認し、両方成立した場合だけ`enabled=true`を返す。
- 出席ボタンはOs `POST /checkin/begin` → WebAuthn → `POST /checkin/finish`でattestationを得る。
- `POST /checkin` は進行中イベントとOs稼働を再確認し、Aedilis `/api/checkin/verify`へユーザトークン付きで中継して本人性 (`payload.sub`)・署名・鮮度・リプレイを検証してからイベント出席を記録する。
- `GET /mine` は本人の現在状況を返す。
- `GET /list` は admin のみに全員一覧を返す。
- `PUT /:userId/status` は admin のみに状況更新を許可する。
- 状況は `unknown | present | absent | late | excused` の列挙値に限定する。

## 制約・前提・既知の制限

- 現在状況と直近の`attendance_event_id` / `attendance_checked_in_at`だけを保持し、履歴・集計は対象外。
- 表示名などの個人プロフィールは GLAB DB に保存しない。
- イベントが無い、終了済み、またはOs未接続/停止中の場合、「出席」ボタンは表示しない。
- 主表示はUUIDではなくイベント名。管理者のメンバー識別にはCorpusの表示名キャッシュを使う。

## 関連

- データ: [`data/glab-user.md`](../data/glab-user.md)
