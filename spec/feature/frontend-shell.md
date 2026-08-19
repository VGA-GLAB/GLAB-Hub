# GLAB frontend shell

ドメイン: `platform-shell` (`.anatomia/domains/platform-shell.*.json`)。
GLAB は Corpus の認証・hub API・宣言的 renderer を再利用しつつ、ブランド表示と
frontend の外殻を `public/` に所有する。実装関数は以下の clause ID を
`@implements` で参照する。

- **SPEC-GLAB-SHELL-001** — `server.ts` は `public/` を `CORPUS_PUBLIC_DIR` として
  Corpus に渡す。`public/index.html` は GLAB の bundle / style と、Corpus の静的
  allowlist で配信できる `/vendor/:file` asset だけを参照する。
- **SPEC-GLAB-SHELL-002** — 未認証時は Corpus の Cernere composite client を
  GLAB ブランドで mount する。passkey redirect は sessionStorage の一回限り state を
  callback の code 交換前に照合し、logout は server session と legacy token の双方を破棄する。
- **SPEC-GLAB-SHELL-003** — 認証後は `/api/me`、`/api/hub/modules`、
  `/api/hub/services` からステータス、GLAB module、参照 service panel のタブを構成する。
  UI へ挿入する外部文字列は text node として扱い、panel の API は same-origin cookie を使う。
- **SPEC-GLAB-SHELL-004** — declarative panel は Corpus renderer を使い、ETag 付き
  descriptor cache を再検証する。SSE の service / panel key が現在表示中の panel と
  一致した場合だけ再描画する。
- **SPEC-GLAB-SHELL-005** — dashboard は認証済み本人のプロフィール、ロール、および
  既存 GLAB 表から集約した本人の活動と集計だけを same-origin API で表示する。活動の
  件数は上限を設け、表示する可変データは text node とし、予期しない内部値を画面やログへ
  出力しない。

## 配信と build

`npm run build:web` は React / ReactDOM を Corpus 側の一つの copy に固定して bundle し、
`vendor:assets` が dockview CSS と committed icon を `public/vendor/` へ同期する。
生成物 (`public/app.js`, source map, `public/vendor/`) は commit しない。

## セキュリティ境界

- Cernere の credential、auth code、session token を log や localStorage に保存しない。
- service の data 操作は manifest data ID を使う Corpus の認証済み proxy に限定する。
- script / declarative panel の実行モデルは Corpus の既存契約を変更せず、GLAB shell が
  任意の外部 redirect、filesystem path、command を新設しない。

