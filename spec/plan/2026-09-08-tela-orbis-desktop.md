# Tela–Orbis を利用する GLAB 常駐操作 UI

## 採用と分担

neco の「操作画面もTela」「TelaにOrbisと連携できる仕組みを用意します」を採用する。
先行設計の Electron remote shell はこの指示で置き換える。保存済み task md の本文は変更しない。

| 所有者 | 責務 |
|---|---|
| GLAB | Tela画面、入力フォーム、既存Hub APIの業務操作、常駐window/tray、部員・owner認可 |
| Tela | 宣言/layout/input/runtimeとPictor描画 adapter |
| Tela–Orbis連携側 | 実transport、Orbis認証sessionの所有、固定HTTPS origin、切断/失効通知、host組立 |
| Cernere/Corpus | 本人認証、GLAB部員policy hook、相談通知machine認証 |

## GLAB が連携側へ必要とする契約

`desktop/include/glab/hub_bridge.hpp` の C++ interface は要求仕様。提供済み wire protocol と混同しない。

- `authenticate`: Orbisで本人認証し、Hub `/api/me` の identity を返す。認証cancelは失敗応答として扱う。
- `request`: originを呼出側文字列から選ばず承認済みHTTPS Hubに固定し、下記path/methodだけ許可する。
- Cookie・Authorization・refresh token・Orbis内部設定をnative側へ返さない。redirectは別originへ追随しない。
- body/responseはUTF-8 JSON、response上限1MiB、timeout30秒以下、書込自動再送なし。既存HubのCSRF保護を通す。
- `checkIn`: 既存Ostiarius/passkey儀式とsubject/nonce/署名検証を維持する。自動出席・自己申告bypassを作らない。
- 失効/切断/identity変更はUI threadへ通知し、古い世代の応答を破棄する。handler解除はcallback終了を保証する。
- `cancelAll`: GLAB分のpendingだけを有限時間で解決する。future破棄やhost終了を永久待機させない。
- browser fallbackは承認Hubだけを開く。native表示や別processへsession cookieをコピーしない。

| 操作 | 既存 API |
|---|---|
| 本人確認・logout | GET `/api/me`, POST `/auth/logout` |
| プロフィール | GET/PUT `/api/x/vantan-user/profile` |
| ホーム | GET `/api/x/dashboard/summary`, POST `/api/x/dashboard/daily-quest/complete` |
| 求人 | GET/POST `/api/x/jobs/`, POST `/api/x/jobs/:id/close` |
| 予定 | GET/POST `/api/x/events/events`, DELETE `/api/x/events/events/:id` |
| 相談 | GET/POST `/api/x/consult/consults`, POST `/api/x/consult/consults/:id/resolve`, PUT `/api/x/consult/availability` |
| 出席 | GET `/api/x/attendance/mine`, 既存passkey儀式によるPOST `/api/x/attendance/checkin` |

## 配布ゲート

実adapter提供、起動host組立、HTTPS origin、部員policy hook配備、passkey実機確認、署名/配布先/rollback前版の確定が必要。
これらが未提供なので現在のライブラリをinstallerや主経路として案内しない。
テスト・起動・再起動・mainへの反映は今回実施しない。PR作成後に停止するSession方針を維持する。
