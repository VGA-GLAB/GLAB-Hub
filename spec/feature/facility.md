# feature/ — 施設予約（Web hub `facility`）

## 目的・ユーザーストーリー

GLAB メンバーが、制作ラボの**施設一覧の閲覧と予約の作成 / 取消**を Web hub から行う。
単独の施設予約画面では施設候補・予約データは **Aedilis** が真実の源で、GLAB は Corpus
connectorとして中継する。イベントで使用する施設ID・表示名・Aedilis対応IDはGLABの
`glab_facility` が正本を持つ。

## 振る舞い（入力 → 処理 → 出力）

パネル（`plugins/facility/panel.ts`）が hub 中継ルートを叩き、バージョン対応コネクタ（id `aedilis`）
越しに Aedilis API へ透過する：

| hub ルート | Aedilis API | 用途 |
|---|---|---|
| `GET /facilities` | `GET /api/facilities` | 施設一覧 |
| `GET /facilities/:id` | `GET /api/facilities/:id` | 施設詳細 |
| `GET /reservations` | `GET /api/reservations`（`?facility=&from=&to=`） | 予約一覧 |
| `GET /reservations/mine` | `GET /api/reservations/mine` | 自分の予約 |
| `POST /reservations` | `POST /api/reservations` | 新規予約 `{facilityId,startAt,endAt,purpose?}` |
| `DELETE /reservations/:id` | `DELETE /api/reservations/:id` | 予約キャンセル |

CompositeログインのCernere user tokenはCorpusの`TokenProvider`でAedilis向けproject tokenへ交換し、
Aedilis側で本人として認証・所有者を確定する。

施設予約パネルはイベント機能から独立する。一方イベントパネルはAedilis施設一覧を未登録候補として
表示し、選択時にGLAB施設マスタへ昇格して予約を自動作成する。

## 制約・前提・既知の制限

- Aedilis側の施設詳細・重複可設定・予約はAedilisの領分。GLAB施設マスタはイベント参照用のローカルID・表示名・対応IDだけを持つ。
- `AEDILIS_BASE_URL` 未設定時は 503（degraded、パネルが「未接続」表示）。

## 関連

- 接点: [`interface/aedilis-connector.md`](../interface/aedilis-connector.md)
