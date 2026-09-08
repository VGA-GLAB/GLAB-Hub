# Discord からの GLAB 操作を廃止する

- Date: 2026-09-08
- Status: fixed in working tree; deployment pending
- Area: Discord Bot / authentication boundary / migration
- Severity: high — Discord 経由の操作は本人性と下流認証の境界が不安定で、失敗時の回復も難しい

## Summary

Discord の `/event`、`/job`、`/chat`、`/orehima` を GLAB の利用者操作入口として使う運用を終了する。
この変更後も Discord は GLAB からの通知先として使う。通知配送後の ACK は通知台帳を進めるための
サービス間処理であり、Discord 利用者の操作入力とは区別する。

## Evidence

- `bot/commands/registry.ts` は従来 4 コマンドを登録していた。空配列へ変更し、REST 同期時に対象 scope の既存 Slash command を削除する。
- `bot/index.ts` の `InteractionCreate` は従来 handler を dispatch し、DB、LLM、GLAB external API へ到達できた。変更後は、同期前に残る Chat Input Interaction へ固定案内を返すだけである。
- Button / Modal の入力 handler はリポジトリ内に存在しない。`InteractionCreate` の購読は `bot/index.ts` の Chat Input 経路だけである。
- `bot/glab-api.ts` は `x-glab-service-token` だけを送るが、Corpus の共通 `requireAuth` が `/api/*` へ先に適用されるため、後段の service-token gate へ到達せず 401 になる。
- 旧 `/job add` は `posted_by` に `${interaction.user.username} (discord)` を保存する。一方 Web の close は Cernere の `getIdentity(c).userId` と比較するため、同じ人物でも一致しない。

## Regression Context

`/orehima` の失敗と相談通知の不整合は、Discord 入力を一部だけ止めても残り得る境界不整合を示した。
Slash command の登録だけを空にしても、Discord 側へ同期するまで既存 command は表示・送信できるため、
実行時 handler 側にも fail-closed の案内が必要である。

## Cause

Discord ID または Discord アカウント名を行為主体とする操作と、Cernere user ID を行為主体とする Web 操作が
併存していた。さらに Bot の service token と Corpus の user authentication の契約が一致していなかった。
個別の認証例外を増やさず、利用者操作を GLAB 画面へ集約する。

## Issue Status

| 課題 | 状態 | この変更での扱い |
|---|---|---|
| Bot `/chat` の Claude CLI 出力上限未適用 | closed in working tree / deployment pending | `/chat` を登録・dispatch しないため運用経路から解消する。旧 CLI 実装は到達不能なソースとして残り、上限処理自体の根治はしていない |
| Cernere 本人確認と GLAB 部員資格の分離不足 | open | Web にも関係する認可課題であり、Discord 入力廃止では解決しない |
| 下流 token 発行失敗後の匿名中継 | open | Web のコネクタにも関係するため継続調査する。認証要件は緩和しない |
| 接続 / 下流 token 発行の重複 | open | 6 client は WS 接続の重複。別に `corpus/server/hub/tokens.ts` は同じ key の並行発行 Promise を共有せず、期限切れ Map の掃除もない。異なる仕組みの課題で、どちらもこの変更では触らない |
| 相談通知の `glabExternal` 401 | open | scheduler の GLAB→Discord 通知経路に残る。全通知が正常になるとは保証できない |
| 既存 Discord 求人の所有者 ID 不一致 | open / newly exposed migration gap | `${interaction.user.username} (discord)` と Cernere user ID は一致しないため、旧投稿者が Web で close できない可能性がある。当面は管理者対応とし、正当な Cernere 連携に基づく所有者移行を別途設計する。アカウント名や名簿 Discord ID だけで自動書換えしない |
| Desktop 主経路への移行 | open / migration gap | desktop 実装は未完成。現時点の操作先は GLAB の Web 画面であり、desktop が利用可能とは案内しない |
| Discord 側に残る Slash command / 稼働中の旧 Bot | open / deployment pending | working tree の変更だけでは消えない。下記の同期と新コード反映が必要 |

## Fix Requirements

- Slash command の正本を空にし、guild / global の各 scope を空配列へ同期できること。
- 同期前の残存 Chat Input Interaction は案内だけを返し、DB 書込、LLM、GLAB API を実行しないこと。
- Bot 起動時に LLM client を初期化しないこと。
- GLAB→Discord のイベント、求人、日次、レビュー、フォーラム等の通知と配送 ACK を維持すること。
- 利用者向けには「現在は GLAB の画面から操作」「desktop 移行は準備中」と平易に案内すること。

## Verification

静的確認では、command registry は空、`InteractionCreate` は固定案内だけを呼び、LLM client の import / 初期化は
Bot entrypoint から消えている。Button / Modal handler が無いことも検索で確認した。
ユーザー指示により test、起動、Discord REST 登録、サービス再起動は実施しない。

## Follow-up

反映担当者は新コードを反映したうえで、過去に使った全 scope を空へ同期する。

1. 過去の guild ID を `DISCORD_GUILD_ID` に設定して `npm --prefix bot run register` を実行する。実装は global を常に空同期し、設定した guild も空同期する。
2. 複数 guild へ登録した履歴がある場合は、各 guild ID を指定して 1 を繰り返す。既知の guild ID が保存済み config にある場合、env を空にするだけでは保存値へ戻るため、明示的に対象 ID を指定する。
3. 稼働中 Bot を正規のサービス管理経路で新コードへ切り替える。現行 catalog に Bot 個別定義が無いため、起動・再起動方法は推測せず運用側で確定する。
4. Discord Developer Portal または REST 取得で global と過去に使った全 guild の command が 0 件になったことを確認する。global 反映には時間差があり得る。

この作業では上記の登録変更、サービス操作、データ所有者移行を実行しない。
