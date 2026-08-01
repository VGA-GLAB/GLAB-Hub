# data/ — GLAB 出席台帳

| テーブル | 用途 |
|---|---|
| `glab_attendance` | ユーザ・JST日付・施設ごとに一意な出席履歴。`source` は `passkey` または `manual`。 |
| `glab_gateway` | Os gateway の `lan_id` と Ed25519 SPKI PEM 公開鍵のキャッシュ。 |
| `glab_attendance_nonce` | attestation nonce の再利用防止。 |

`glab_attendance` は `UNIQUE(user_id, date, facility_id)` を持つ。nonce の重複（replay, 409）と、この一意制約による同日二度目（idempotent success, 200）は別の処理である。

日時は epoch milliseconds、台帳の `date` は `Asia/Tokyo` で算出した `YYYY-MM-DD`。passkey 出席では attestation の `issuedAt` を出席時刻・日付の根拠とする。

`glab_attendance_nonce` は履歴ではなくリプレイ判定のための一時データなので、24 時間より古い行は nonce 予約時に削除する。鮮度窓（120 秒）を過ぎた attestation は再提示されても `attestation_stale` で弾かれるため、削除しても判定は変わらない。
