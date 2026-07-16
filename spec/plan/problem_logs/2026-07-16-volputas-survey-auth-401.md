# Volputas アンケート取得が 401 になる

- 発生日: 2026-07-16
- 状態: 原因確定・設定反映待ち
- 影響: GLab Hub のアンケート画面で一覧を取得できず、「Cernereログインを確認してください」と表示される

## 現象

GLab Hub から Volputas のアンケート一覧を開くと、連携 API が 401 を返し、アンケートを表示できない。

## 調査結果

Cernere の実行ログで `/api/auth/project-token` が 500 を返しており、`CERNERE_PASETO_SECRET_KEY / CERNERE_PASETO_PUBLIC_KEY` 未設定が原因と確定した。`/.well-known/cernere-public-key` も `keys: []` を返しているため、GLAB はVolputas用project tokenを取得できず、Volputasへtokenなしで到達して401になっていた。

Infisical CLIで鍵登録を試みたが、設定先 `infisical.vtn-game.com` がDNS解決できず、1件も保存されていない。InfraのDocker backendも接続不能だった。

## 修正方針

- Cernere公式スクリプトで生成したPASETO鍵ペアをInfisical devへ登録する
- CernereをExcubitor経由で再起動し、公開鍵が1件以上返ることを確認する
- project token の audience とキャッシュキーに使う service URL を末尾 `/` なしへ正規化する（予防修正済み）
- 末尾 `/` ありの connector URL でも、Cernere へ送る `hub_url` が安定する回帰テストを追加する
- Volputas 側の認証要件は緩和しない

## 検証

unit test、typecheck、buildは成功。Infisical復旧後にCernere再起動とGLab Hubからのアンケート一覧取得を確認する。
