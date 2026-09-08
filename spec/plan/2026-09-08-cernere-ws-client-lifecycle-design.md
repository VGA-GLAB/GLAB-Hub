# Cernere WebSocket client 共有・寿命設計

## 決定

dashboard、consult、jobs、members、tirocinium、vantan-user が個別に生成する `CernereProjectClient` を、GLAB process
単位の専用 owner が canonical Cernere URL、client ID、project key の組ごとに一つだけ保持する。巨大な resource manager は作らず、`get(config)` と
`closeAll()` だけを公開する。client の既存 `connectPromise`、pending request timer、`close()` を再利用する。

| lifecycle | 契約 |
|---|---|
| 初回取得 | map にない key の client を同期的に一つ生成。socket 接続は既存の lazy 動作 |
| 同時取得 | 同じ instance を返し、接続試行は client の `connectPromise` が共有 |
| module setup 失敗 | bootstrap 全体失敗なら owner close。単一 plugin 失敗を Corpus が隔離する場合は他 plugin の共有資源を保持し process 終了時に close |
| SIGINT / SIGTERM | 新規 request を止め、pending を reject して `closeAll()`、既存 store close へ続く |
| 再接続 | instance 内の既存方針に従い、plugin は独自 client を再生成しない |
| credential rotation | 新 credential の client 接続成功後に切替え、旧を drain/close。短期二重接続は rotation 時だけ許容 |

Corpus の `CorpusModule` / `CorpusContext` に shutdown hook は現存しない。所有権は GLAB entrypoint に置き、既存の
`server.ts` signal handler と初期化失敗 cleanup へ統合する。既存 task の編集 scope に `server.ts` がないため、実装時は
追加 scope を新規 task または今回の依頼根拠で明示する。Corpus bootstrap 内の直接 `process.exit(1)` は finally で捕捉
できないため、全失敗時の close を保証しない。保証には Corpus が例外を呼出元へ返す契約への変更、または hard exit 前の
同期 cleanup hook が別途必要である。lazy 接続により未使用 client の socket は開かない。
rotation の新接続失敗は明示エラーとし、旧 credential が有効なら旧接続を維持する。漏洩による失効時は旧接続を直ちに閉じ、
可用性より失効を優先する。

## 実装分担と受入

- GLAB: `plugins/cernere/` に owner、6 plugin は注入された共有 client を使い、`server.ts` が close を所有
- Corpus: 将来 shutdown hook を提供する場合も ownership を二重化せず GLAB owner から登録
- tests: 6 setup で生成1回、同時 connect1回、signal/初期化失敗で pending reject と close1回

受入条件は、通常稼働で project key ごとの active socket が一つ、plugin teardown の順序に依存せず close が冪等、
未捕捉 hard exit の制約が運用・実装文書に残ることである。6 plugin の既存 degraded / optional 設定は維持し、
共有 client 障害で process 全体を無条件停止しない。

## 参照

- `plugins/cernere/create-client.ts`
- `plugins/dashboard/index.ts`
- `plugins/consult/index.ts`
- `plugins/jobs/index.ts`
- `plugins/members/index.ts`
- `plugins/tirocinium/index.ts`
- `plugins/vantan-user/index.ts`
- `server.ts`
