# feature/ — GPS + 写真チェックイン（Web hub `attendance`、契約 G2）

## 目的

スマホから会場 Wi-Fi の passkey 経路を使わずに出席する。スマホの GPS が Ostiarius（Os）の宣言する会場位置と一致し、その場で撮った写真（EXIF 日時・SHA-256 で使い回しを弾く）を添えたときに、`method="gps"`・`assurance="low"` の出席として数える（neco 2026-10-04）。

3 リポ共通の契約（G1 Os の位置の宣言 / G2 スマホ → GLAB / G3 GLAB → Aedilis）の G2 を GLAB が持つ。名前・パス・エラーコードは契約から変えない。

## 振る舞い

- 出席パネルに「GPS で出席」を出す。`navigator.geolocation.getCurrentPosition`（`enableHighAccuracy`）で `{ lat, lon, accuracyM, positionAt }`（`positionAt` は epoch ms）を取り、`<input type="file" accept="image/*" capture="environment">` で写真を 1 枚撮って送る。
  - secure context でない（https でない）・geolocation 非対応・位置の許可拒否・タイムアウトはそれぞれ案内文を出す。
  - 結果は Aedilis のエラーコードごとの案内文で表示する（`plugins/attendance/gps-checkin-messages.ts`）。
- `GET /availability` は `gps.available` を返す。Os の health に `locationStatement` があるときだけ true。
- `POST /checkin/gps`（multipart/form-data、利用者認証必須）
  1. 利用者 token が無ければ 401 `unauthorized`（上流へ流さない）。
  2. 本文は 10 MB + 64 KB までしかメモリへ取り込まない。写真が 10 MB 超なら 413 `photo_invalid`、`image/jpeg` / `image/heic` 以外は 400 `photo_invalid`、`lat` `lon` `accuracyM` `positionAt` が数値でなければ 400 `invalid_input`。範囲・鮮度・EXIF の判定は Aedilis（G3）が持つ。
  3. Os の health probe（既存の `ostiarius` コネクタ）で最新の `locationStatement` を得る。無ければ 503 `location_statement_unavailable`。
  4. 既存の `authorizedConnectorFetch` で利用者の token のまま Aedilis `POST /api/checkin/gps` へ `locationStatement` `lat` `lon` `accuracyM` `positionAt` と `photo` を中継する。
  5. Aedilis の 4xx のうち固定語彙（`invalid_input` … `rate_limited`）は状態コードごと透過する。コネクタ未設定・token 発行不可は 503 で透過し、それ以外の上流異常は 502 `aedilis_upstream_error`。
  6. Aedilis が 200 `{ ok: true, attendanceId }` を返したときだけ、GLAB の台帳（`glab_attendance`）に `source='gps'`・`assurance='low'` で記録し（施設は宣言の `facilityId`、同日同施設の二度目は既存規則どおり書き換えない）、写真を保存する。
  - 応答は常に `cache-control: private, no-store`。
- `GET /gps-photos/:attendanceId` は GLAB にログインした利用者なら誰でも写真を取得できる。直リンクでも利用者 token が無ければ 401。応答は `private, no-store` と `nosniff`。
- 出席一覧（本人の直近 30 日・管理者の本日台帳）の GPS 行に「出席写真」を出し、押した 1 件だけ認証付き API で取得して表示する。今日の出席簿（全員向けの最小項目）には出さない。

## 写真の保存

- 本体は `CORPUS_DATA/gps-photos/<sha256>`（`server.ts` が `CORPUS_DATA` を `data/` に既定する）。ファイル名は内容アドレスなので利用者入力がパスに入らない。一時ファイル → rename で書く。
- 紐付けは `glab_gps_photo`（`attendance_id` = Aedilis の attendanceId、`ledger_id` = GLAB 台帳行、`user_id`、`captured_at`、`sha256`、`content_type`、`byte_size`、`stored_at`）。`captured_at` は撮影フローの `positionAt`（EXIF の撮影時刻は Aedilis が ±10 分で検証済み）。
- 拒否された写真（Aedilis が 200 以外）は保存しない。写真の保存に失敗しても出席は Aedilis で成立済みなので 200 `photoStored: false` を返し、失敗だけをログに残す。
- 写真のバイト列・位置・SHA-256 はログに出さない。

## 運用

- Os 側で `OSTIARIUS_FACILITY_LAT` / `OSTIARIUS_FACILITY_LON` / `OSTIARIUS_FACILITY_RADIUS_M` を Excubitor Vault / catalog に登録しないと宣言が出ず、GPS 出席は 503 で止まる（G1）。
- 写真の削除・保持期間は未定（現状は無期限）。
