# test/ — テスト戦略

GLAB は Node test runner による自動テストと、ブラウザ/Discord の手動確認を併用する。
認証・認可境界、SQLite の実 SQL、入力スキーマを重要経路として毎変更時に検証する。

## 現状（v0.1）— 手動テスト

| 種別 | 対象 | 実行方法 | 担保するもの |
|---|---|---|---|
| 型チェック | hub（server + plugins） | `npm run typecheck`（`tsconfig.json` + `tsconfig.frontend.json`） | 型レベルの整合 |
| 型チェック | Bot | `npm --prefix bot run typecheck` | 型レベルの整合 |
| ビルド | panels / corpus-web | `npm run build` | esbuild バンドルが通る |
| 自動テスト | hub データ・Cernere client・入力検証 | `npm test` | 実 SQLite、project WS 契約、権限 fail-closed、回答方式 |
| 横断契約 | GLAB が保持する Cernere 参照データ | `node ../Foedus/dist/cli.js contract-check --root .. --repos GLAB --skip-external-schema --json` | `plugins/data.ts` の `user_id` は owner-ref、PII/OAuth token の自前保持は C-DATA-01/02 で検出 |
| 手動（hub） | 各タブの表示・操作 | `npm run dev` → ブラウザ → Cernere 認証 → 各タブ確認 | UI と API の疎通。Aedilis / Volputas 未稼働なら degraded 表示で OK |
| 手動（Bot） | slash command | `config-setup` 後 `npm run start` → Discord で `/event` `/job` `/chat` | コマンド登録 / 通知 / LLM 応答 |

## degraded モードの確認

`AEDILIS_BASE_URL` 未設定で `facility` パネルが「未接続」を表示すること、および
`VOLPUTAS_URL` 未設定で `volputas` パネルが「未接続」を表示すること
（connector が 503 を返す経路、[`interface/aedilis-connector.md`](../interface/aedilis-connector.md)）を
手動で確認する。

## 自動テストの重点

CLAUDE.md / DESIGN §4 の方針に沿い、優先度順に：

1. `plugins/data.ts` は in-memory の実 SQLite でスキーマ・単回答更新・複数回答追加・旧回答移行を検証する。
2. Cernere project client は WebSocket 契約を fake transport で固定し、`volputas_users` を
   Cernere user ID で読むことと、欠落・型不正を権限なしにすることを検証する。
3. 入力 Zod スキーマは設問型、回答範囲、複数回答設定の既定を検証する。
4. Volputas API URL は絶対 HTTP(S) URL だけを許可する。
5. Discord コマンドとブラウザ描画は手動 smoke test を併用する。

Foedus の `--skip-external-schema` は Cernere schema-export に到達できないローカル環境で
だけ明示する degraded モードであり、GLAB の `plugins/data.ts` に対するローカル保持
データ検査は省略されない。ライブ export token がある環境ではこのオプションを外す。

## 関連

- データ: [`data/glab-event.md`](../data/glab-event.md) / [`data/glab-job.md`](../data/glab-job.md)
- 接点: [`interface/corpus-db-shared.md`](../interface/corpus-db-shared.md)
- Volputas: [`interface/volputas-connector.md`](../interface/volputas-connector.md)
