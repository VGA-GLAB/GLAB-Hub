# GLab起動時にCorpusのフロントエンド依存が欠落する

- Date: 2026-07-19
- Status: fixed in working tree
- Area: GLab / Corpus predev build
- Severity: GLabを起動できない

## Summary

Excubitor経由でGLabを再起動・起動しても、管理プロセスがexit code 1で直ちに停止した。GLab本体の`predev`がCorpus Webをビルドする際、必要な`dockview-core`が`corpus/node_modules`に存在せず、サービスがLISTEN開始前に終了している。

## Evidence

- 2026-07-19 15:02 JSTごろ、Excubitor `restart glab`はPID 18408を返したが、直後のstatusは`stopped`。
- 2026-07-19 15:04 JSTごろ、Excubitor `start glab`はPID 46360を返したが、直後のstatusは`stopped`。
- Excubitor DBの`service_instances`は`state=stopped`、`exit_code=1`。
- GLab本体で`npm run build`を再現すると次のエラーになる。

```text
Error: ENOENT: no such file or directory, copyfile
E:\Document\Ars\GLAB\corpus\node_modules\dockview-core\dist\styles\dockview.css
```

## Regression Context

同じソースは別worktreeではビルド成功していた。プロジェクト本体の`corpus/node_modules`だけが不完全であり、ソース差分では検出できなかった環境回帰である。

## Cause

GLab本体では次の複合状態が発生していた。

- `corpus/lib/vestigium` submoduleが空で、`@ludiars/vestigium`のjunction先に実体がなかった。
- `NODE_ENV=production`のため、通常の`npm ci`ではVestigium、Corpus、GLabのdevDependenciesが省略された。
- その結果、predevに必要なTypeScript、esbuild、`@simplewebauthn/browser`と、Vestigiumの`dist`が不足した。

## Fix Requirements

- GLab本体フォルダのCorpus依存をlockfileどおりに復元する。
- `npm run build`を成功させる。
- Excubitor経由でGLabを起動し、catalogのGLabポートがLISTENすることを確認する。
- worktreeや複製フォルダからサービスを起動しない。

## Verification

- `git -C corpus submodule update --init --recursive`
- `npm --prefix corpus/lib/vestigium ci --include=dev`
- `npm --prefix corpus ci --include=dev`
- `npm ci --include=dev`
- `npm run build`
- Excubitor `service glab start --json`
- Excubitor statusとcatalogポートLISTENの確認

2026-07-19 15:27 JST、Excubitor管理状態`running`、PID 77520。catalogポート5187のLISTEN、`GET /`の200応答、公開マニフェスト内の`projects`と`volputas`パネルを確認した。

## Follow-up

サービス起動前にCorpus依存の不足を明示できるpreflight、または安全な依存復元手順を検討する。
