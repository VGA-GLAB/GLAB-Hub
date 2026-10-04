---
task: gps-photo-checkin
project: glab
kind: implementation
created: 2026-10-05
actio: actio:874d0c3e-9db1-4ae8-b208-236c70bcf63a
memory_links:
  - spec/feature/gps-photo-checkin.md
---

# GLab: GPS + 写真チェックイン（契約 G2）

本文の正本は Actio（上記 reference）。仕様は `spec/feature/gps-photo-checkin.md`。

## 分解

1. 台帳の `source` に `gps` を足す移行（`face` 世代の assurance を保持）と `glab_gps_photo` 表 — `plugins/data.ts`
2. multipart の上限付き読み取り — `plugins/attendance/gps-checkin-form.ts`
3. Os health からの `locationStatement` 抽出 — `plugins/attendance/location-statement.ts`
4. Aedilis への中継・台帳記録・写真保存 — `plugins/attendance/gps-checkin.ts`
5. 写真ファイルストア / 閲覧 API — `gps-photo-files.ts` / `gps-photo-routes.ts`
6. パネル（GPS で出席・案内文・出席写真）— `gps-checkin-panel.ts` / `gps-checkin-messages.ts` / `gps-photo-view.ts`
7. テスト — `tests/gps-checkin.test.ts`、`tests/attendance-gps-schema.test.ts`

## 受け入れ条件

- C-8 readGpsCheckinForm(source): jpeg/heic で 10 MB 以下の写真と 4 つの数値欄だけを受理し、超過は 413 photo_invalid、型違いは photo_invalid、欠落は invalid_input
- C-9 locationStatementFromHealth(payload): Ostiarius の health に locationStatement が無い・空・形式違いなら null を返す (中継は 503)
- C-10 saveGpsPhoto(db, photo): Aedilis が採用した写真を attendanceId に一度だけ結び付け、利用者・撮影時刻・SHA-256 を持つ
- C-11 handleGpsCheckin(c, deps): 応答は成否を問わず private, no-store で、成功は 200・失敗は 4xx/5xx の error コードで返す

status: done
