# イベント登録が 404 になる

- 発生日: 2026-07-16
- 状態: 実装修正済み・ライブ連携確認待ち
- 影響: GLab Hub のイベント登録フォームからイベントを保存できない

## 現象

施設名または ID と利用時間を入力して登録すると、画面に「登録に失敗しました (404)」と表示される。

## 調査結果

イベントパネルは module API のルート `/` に POST しており、Corpus の module mount path と組み合わせた末尾スラッシュ付き URL が、実行環境のルート契約と一致していない。

## 修正方針

- イベント API を明示的な `/events` path にする
- GLab の施設マスタを追加し、イベントは GLab の施設 ID を参照して保存する
- Aedilis の施設一覧は施設候補の同期にだけ用いる
- イベント登録時に Aedilis の施設予約を作成し、予約 ID を GLab イベントへ保存する
- Aedilis 連携は Cernere project token を使用し、`AEDILIS_SERVICE_TOKEN` は使用しない

## 検証

明示的な `/events` route、GLAB施設マスタ、Aedilis予約作成・取消連動を実装した。unit test、typecheck、buildは成功。AedilisのExcubitor起動はInfisical secrets fetch 403で失敗したため、認証付きライブ登録はInfra/Infisical復旧後に確認する。
