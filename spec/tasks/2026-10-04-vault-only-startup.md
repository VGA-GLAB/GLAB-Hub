# GLAB の起動を Ex Vault 注入へ統一する

参照: actio:b2388b08-ee10-4398-bbef-14a11970e0a0

## 実装内容

- [x] dev/start の env-file 指定、env:*、env-cli.config.ts、.env.example を撤去。
- [x] Ex 注入の必須値を DB 初期化前に検証し、空白を含む欠落をキー名だけで報告。
- [x] Corpus のログ初期化を再利用し、index.ts を直接 import。
- [x] README / CLAUDE / setup と関連設定仕様を Vault 前提へ更新。
- [x] 契約・述語を実装前に作成し、回帰テストを記述。

## 再利用と影響範囲

Corpus は実際に in-process で使われる。gitlink 7610d46deb912827867baf1abcaf0901f88a9c36 と
一致する本体 checkout を読み取り確認した。既存 installLogging を再利用し、
env-bootstrap を呼ぶ standalone bootstrap は GLAB から除外する。
Corpus の env-cli 設定、.env.example、scripts/services.ts は独立起動用で GLAB から呼ばれない。
hub/tokens.ts の Infisical 言及は保存禁止のコメントのみで取得処理はない。
submodule のコード・pointer を変える必要はない。
Ex が設定の正本となるため、Corpus CLI の引数による env 上書きも GLAB では適用しない。

## 受け入れ条件

C-1 requireInjectedEnvironment(env): 必須の Ex 注入値が空なら値を含まないエラーで起動を拒否する

起動コマンドには dotenv / env-file / env-cli がなく、Corpus standalone bootstrap を読み込まない。
既存 store の初期化と shutdown の順序を維持し、secret 値・実データ・他 repo を変更しない。

## 検証計画と実施範囲

augur plan は現行挙動の characterization unit test を提案した。
tests/vault-startup.test.ts に注入成功、各キーの未定義・空文字・空白、全欠落、
旧 credential のみでは失敗するケース、起動コマンドと import 経路の静的回帰検査を記述した。
テスト・サービス起動・ビルドはタスク本文の指定により未実行。審査へ委ねる。
git diff --check を実施。契約の実行証跡を合格と自己申告しない。
Augur inject apply と contracts lint は成功（findings なし）。未導入の log-weaver を
本番依存へ追加しないため、実行しない計測 wrapper は inject remove で除去し、
manifest と述語を審査時の再注入用に残した。集計は calls 0 / met false。
DELEGATION_STARTED_AT が未設定のため、run API の created_at を集計開始時刻に使用した。
