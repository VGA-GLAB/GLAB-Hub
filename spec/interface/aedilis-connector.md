# interface/ — Aedilis コネクタ（施設）

施設予約（`facility`）モジュールは Corpus の connector（id `aedilis`、`scope: 'multi'`、
`baseUrl = AEDILIS_BASE_URL`）越しに Aedilis のバックエンドへ中継する。
イベントモジュールは GLAB PostgreSQL に施設マスタを持ち、Aedilis の施設一覧は未登録施設の
候補表示にだけ使う。候補がイベントで初めて選択された時点で GLAB 施設マスタへ昇格する。
`user_id` の参照行はこのコネクタを使わず、GLAB の `glab_user` が正本を持つ。出席の正本は
`glab_attendance`（[`data/glab-attendance.md`](../data/glab-attendance.md)）であり、
Aedilis はこのコネクタを含め出席検証に関与しない。

## 中継方式（`plugins/shared.ts` の `proxy`）

- メソッド / クエリ文字列 / ボディを転送する。`Authorization` はログイン中ユーザの
  Cernere access token から Aedilis 用 project token を発行して付与する。
- レスポンスの status / `content-type` を透過して返す。
- token発行失敗（例外/null/空文字/空白）は送信前に `503 downstream_token_unavailable`。
  詳細は [下流認証契約](downstream-authorization.md)。応答は `private, no-store`。
- connector が例外（接続失敗等）を投げた場合は `502 { error: 'connector_error', connector }`。
- `baseUrl` 空（`AEDILIS_BASE_URL` 未設定）のとき `HttpServiceConnector` が `503` を返し、
  パネルが「未接続（degraded）」を表示する。

## マッピング（hub ルート → Aedilis API）

### `facility`（`plugins/facility/index.ts`）
| hub ルート | Aedilis | 用途 |
|---|---|---|
| `GET /facilities` | `GET /api/facilities` | 施設一覧 |
| `GET /facilities/:id` | `GET /api/facilities/:id` | 施設詳細 |
| `GET /reservations` | `GET /api/reservations` | 予約一覧（`?facility=&from=&to=`） |
| `GET /reservations/mine` | `GET /api/reservations/mine` | 自分の予約 |
| `POST /reservations` | `POST /api/reservations` | 新規予約 `{facilityId,startAt,endAt,purpose?}` |
| `DELETE /reservations/:id` | `DELETE /api/reservations/:id` | 予約キャンセル |

## イベント連動

- `GET /api/x/events/facilities` は GLAB 施設マスタと Aedilis 候補を分けて返す。
- `POST /api/x/events/events` は Aedilis 予約を先に作り、成功時だけ GLAB イベントを保存する。
- GLAB 保存失敗時は作成済み予約を best-effort で取り消す。
- イベント削除時は Aedilis 予約を取り消してから GLAB イベントを削除する。
- 固定の `AEDILIS_SERVICE_TOKEN` は使用しない。

## Google Meet（`plugins/facility/meet-routes.ts`）

neco 2026-10-14「Ae と接続し、Meet のリンクを発行した予定を登録できるようにする。Meet の代表者になる
アカウントは GLab でログインする」。会議 (Aedilis の日程調整) に Meet リンクを発行する。中継はすべて
`bookingProxy` の署名付き (`x-glab-booking-context`) で、Aedilis はこれを同一 Origin 検査の代わりに受ける
(Aedilis `spec/feature/managed-google-meet.md` SPEC-MANAGED-MEET-GLAB-RELAY)。

| hub ルート | Aedilis API | 用途 |
|---|---|---|
| `GET /meet/status` | `GET /api/meet/status` | 代表アカウントの設定状況・自分の Google 連携 |
| `POST /meet/oauth/start` `{mode}` | `POST /api/meet/oauth/start` | Google 認可 URL。`redirectUri` はサーバが `CORPUS_PUBLIC_URL` から作る (利用者は渡せない) |
| `GET /meet/oauth/callback` | `POST /api/meet/oauth/complete` | Google の戻り。GLab のログイン cookie で本人確認し、code/state を Ae へ渡して結果ページを返す |
| `GET /meet/:id` | `GET /api/meet/:id` | 会議の Meet リンク |
| `POST /meet/:id` | `POST /api/meet/:id` | Meet リンクの発行 (会議の主催者だけ、オンライン参加可の会議だけ) |

- 代表アカウント (organizer) は Aedilis の `AEDILIS_ADMIN_IDS` に入っている Cr ユーザが、GLab にログインしたまま
  「このアカウントを Meet の代表にする」で Google (Workspace) を認可する。
- 作成者の Google 連携は任意。無ければ代表アカウントだけがホストになる。連携すると共同ホストになる。
- 会議の作成フォームで「作成時に Google Meet のリンクを発行する」を選ぶと、作成直後に発行する。失敗しても会議は残り、会議の欄から再発行できる。
- 戻り先 `<CORPUS_PUBLIC_URL>/api/x/facility/meet/oauth/callback` は Aedilis の `AEDILIS_MEET_EXTERNAL_REDIRECT_URIS` と、
  Google OAuth client の承認済みリダイレクト URI の両方に登録する (後者は Google Cloud の画面で人が行う)。
- 結果ページは固定文言だけで、code・state・トークンを載せない。opener へは同一 Origin 限定の postMessage で結果だけを知らせる。

## 関連

- 機能: [`feature/facility.md`](../feature/facility.md)
- 設定: [`setup/environment.md`](../setup/environment.md)
- 出席: [`data/glab-attendance.md`](../data/glab-attendance.md)
