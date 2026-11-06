# 下流サービスへの認証付き中継

現行の移行契約は `spec/feature/bound-service-authentication.md`。再利用できる
Bearer user token 発行は廃止し、明示 project/method/path/action に対する一度限りの
`Cernere-Delegation` と準備済み request bytes/headers を TokenProvider から受け取る。
未分類は `503 downstream_operation_unclassified`。unknown/denied は従来どおり下流へ
送らず、匿名・呼出元 Authorization・旧 user token へ戻らない。
以下の旧 token 文字列に関する記述は履歴であり、空文字などの成功値を扱う互換経路はない。

`plugins/connector-authorization.ts` の `authorizedConnectorFetch` を、通常の `proxy`、
バイナリの `proxyStream`、イベントの `AedilisEventClient` が共有する。
既存の `plugins/shared.ts` からのexportは維持する。

- base URL未設定は `503 connector_unconfigured`。token providerも下流fetchも呼ばない。
- token発行の例外、null、空文字、空白だけの値は `503 downstream_token_unavailable`。
  下流fetchを呼ばず、呼出元が渡したAuthorizationによる代替も行わない。
- 503は `Cache-Control: private, no-store`。issuerの例外文や資格情報は返さない。
- 成功時のみ、発行したtokenでAuthorizationを上書きし、method/body/query/Rangeを中継する。
- 下流接続の例外はproxyで502、AedilisEventClientでは既存のunreachableに写像する。

## 影響する接続先

| 利用箇所 | データ通信 |
|---|---|
| facility | Aedilis施設・予約一覧、作成、取消 |
| events/AedilisEventClient | Aedilis施設候補、予約作成・取消 |
| tirocinium | 企業一覧 |
| volputas | アンケート・感想・ゲーム・証拠データ、動画アップロード/再生 |

`VersionedHttpServiceConnector.health/probe` は公開health用の独立経路であり、この認証中継を
通らない。Calliopeは固定machine credentialの専用コネクタを使う。公開healthを認証必須APIの
代替として利用しない。利用者向けAPIを「公開APIも受け付けるから」と匿名で送信しない。

受入: token失敗4類型と成功時のヘッダ・本文・stream転送を回帰テストで確認する。
対象タスク: #2264。今回テスト実行は未承認のため未実施。
