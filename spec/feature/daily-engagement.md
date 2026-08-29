# feature/ — 5分クエストと今日のスポットライト

## 目的

GLAB Hub を毎日開く小さな理由をつくる。ログイン後のダッシュボード先頭に、全員共通の
「5分クエスト」と進行中プロジェクト1件の「今日のスポットライト」を表示し、Discord でも
同じ内容を1日1回知らせる。

## 契約

- **SPEC-GLAB-DAILY-001** — 日付は `Asia/Tokyo` で区切り、同じ `date_key` の選択を SQLite に
  一度だけ保存する。同じ日は、利用者や Hub/Bot の経路によらず同じクエストとスポットライトを返す。
- **SPEC-GLAB-DAILY-002** — スポットライトは `status='active'` のプロジェクトから、累計採用回数が
  少ない順、最終採用日が古い順で選ぶ。日中にプロジェクトが更新されても当日の選択は変えない。
- **SPEC-GLAB-DAILY-003** — 「できた！」は認証済み本人の Cernere `user_id` と日付だけを記録する。
  クエスト本文やプロジェクト情報をユーザー別に複製しない。達成操作は冪等とし、画面が示す
  `date_key` が現在の東京日付と一致しない場合は記録しない。
- **SPEC-GLAB-DAILY-004** — Bot は `GLAB_DAILY_NOTIFY_AT`（既定 09:00、Asia/Tokyo）以降の最初の
  scheduler tick で投稿する。Discord がメッセージ ID を返した後だけ通知済みにし、失敗時は次 tick で
  再試行する。ユーザー由来の本文ではメンションを解決しない。
- **SPEC-GLAB-DAILY-005** — active project がない日も固定クエストを提供し、Hub と Discord は
  プロジェクト登録を促す代替表示にする。

## 構成

- `plugins/daily-engagement/catalog.ts` — クエストカタログ、東京日付、通知時刻判定。
- `plugins/daily-engagement/public-url.ts` — Hub / Discord で公開する URL の scheme・資格情報検証。
- `plugins/daily-engagement/store.ts` — 当日選択、達成、Discord 通知成功の永続化。
- `plugins/dashboard/` — 認証済みAPIとダッシュボードカード。
- `bot/notify/daily-engagement*.ts` — Discord 本文生成と日次投稿。

日次レコードを選択の正本にする方式は、既存の日次通知と同じく「構成・送信・成功記録」を分離する。
これにより Hub が先に開かれても Bot が先に動いても結果は変わらない。

## 関連

- データ: [`data/glab-daily-engagement.md`](../data/glab-daily-engagement.md)
- Discord: [`interface/discord-commands.md`](../interface/discord-commands.md)
- ダッシュボード: [`feature/frontend-shell.md`](./frontend-shell.md)
