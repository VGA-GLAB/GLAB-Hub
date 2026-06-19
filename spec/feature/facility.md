# feature/ — 施設予約（Web hub `facility`）

## 目的・ユーザーストーリー

GLAB メンバーが、制作ラボの**施設一覧の閲覧と予約の作成 / 取消**を Web hub から行う。
施設マスタ・予約データは **Aedilis** が真実の源で、GLAB は接続して見せるだけの Corpus コネクタ
（自前データを持たない）。

## 振る舞い（入力 → 処理 → 出力）

パネル（`plugins/facility/panel.ts`）が hub 中継ルートを叩き、`HttpServiceConnector`（id `aedilis`）
越しに Aedilis API へ透過する：

| hub ルート | Aedilis API | 用途 |
|---|---|---|
| `GET /facilities` | `GET /api/facilities` | 施設一覧 |
| `GET /facilities/:id` | `GET /api/facilities/:id` | 施設詳細 |
| `GET /reservations` | `GET /api/reservations`（`?facility=&from=&to=`） | 予約一覧 |
| `GET /reservations/mine` | `GET /api/reservations/mine` | 自分の予約 |
| `POST /reservations` | `POST /api/reservations` | 新規予約 `{facilityId,startAt,endAt,purpose?}` |
| `DELETE /reservations/:id` | `DELETE /api/reservations/:id` | 予約キャンセル |

Bearer（Cernere トークン）は Aedilis へ透過し、Aedilis 側でユーザ権限を保存する。

## 制約・前提・既知の制限

- 施設マスタ・予約そのものの編集は **Aedilis の領分**（GLAB は持たない / 触らない）。
- `AEDILIS_BASE_URL` 未設定時は 503（degraded、パネルが「未接続」表示）。

## 関連

- 接点: [`interface/aedilis-connector.md`](../interface/aedilis-connector.md)
