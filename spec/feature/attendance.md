# feature/ — 出席台帳（Web hub `attendance`）

## 目的

GLAB メンバーは会場 Wi-Fi 内の Ostiarius（Os）から取得した passkey attestation で出席する。Hub は Os の Ed25519 公開鍵を HTTP で取得して保持し、署名を自前検証してから SQLite の出席台帳に記録する。Aedilis は出席検証に関与しない。

## 振る舞い

- 起動時に Os `GET /gateway-public-key`（`lanId`, `facilityId`, `publicKeyPem`）を取得して `glab_gateway` に upsert する。Os が未到達なら起動を失敗させず、既存鍵だけを使う。この取得は hub 起動シーケンス上で await されるため 5 秒でタイムアウトさせる。
- `POST /checkin` は attestation の形式、gateway、Ed25519 署名、`Math.abs(now - issuedAt) <= 120_000` を順に検証する。未来の issuedAt も同じ鮮度判定で拒否する。
- attestation の `sub` はログイン中の Cernere user ID と一致しなければ 403 `subject_mismatch`。nonce は先に一度だけ予約し、重複は 409 `replay_detected`。
- 同じ user/date/facility に別 nonce で再度出席した場合、台帳は更新せず 200 `{ ok: true, alreadyCheckedIn: true }` を返す。
- `GET /mine` は本人の直近30日、admin の `GET /list?date=&facilityId=` は絞り込んだ台帳、`GET /summary?from=&to=` は日別・施設別人数を返す。`from` / `to` は `YYYY-MM-DD` 以外なら 400 `invalid_date_range`。
- 台帳のイベント名は行ごとに引かず、重複を除いた `event_id` 単位で 1 回だけ取得する。イベント紐付けの無い台帳だけなら（`event_id` が全て NULL なら）イベントストアには触れない。
- 出席の成立はイベントに依存しない。イベントストア（Postgres）が引けない場合は `event_id` を紐付けずに記録し、`POST /checkin` は成功を返す。記録後にイベントを引き直さない（台帳に書けたのに 500 を返さないため）。
- admin は `POST /manual { userId, date, facilityId }` で `source='manual'` の出席を記録する。記録者は detail に保存する。

## 制約

- `glab_user` は projects が参照するため残す。出席の正本は `glab_attendance` であり、`glab_user.attendance_*` は deprecated compatibility fields とする。
- 検証なしセルフチェックイン `POST /mine/checkin` は存在しない。
- Ostiarius は submodule に追加しない。鍵取得・検証は node:crypto と HTTP のみを使う。
