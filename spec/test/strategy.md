# test/ — テスト戦略

GLAB は v0.1。**現状はテスト自動化を持たず、手動テストで担保している**（CLAUDE.md「テスト方針」）。
ここでは現状を正直に記し、後続で入れる自動テストの計画を併記する。

## 現状（v0.1）— 手動テスト

| 種別 | 対象 | 実行方法 | 担保するもの |
|---|---|---|---|
| 型チェック | hub（server + plugins） | `npm run typecheck`（`tsconfig.json` + `tsconfig.frontend.json`） | 型レベルの整合 |
| 型チェック | Bot | `npm --prefix bot run typecheck` | 型レベルの整合 |
| ビルド | panels / corpus-web | `npm run build` | esbuild バンドルが通る |
| 手動（hub） | 各タブの表示・操作 | `npm run dev` → ブラウザ → Cernere 認証 → 各タブ確認 | UI と API の疎通。Aedilis 未稼働なら degraded 表示で OK |
| 手動（Bot） | slash command | `config-setup` 後 `npm run start` → Discord で `/event` `/job` `/chat` | コマンド登録 / 通知 / LLM 応答 |

> **自動テスト（vitest 等）は未導入。** CI ゲートも v0.1 時点では型チェック / ビルドのみ。

## degraded モードの確認

`AEDILIS_BASE_URL` 未設定で `facility` パネルが「未接続」を表示すること
（connector が 503 を返す経路、[`interface/aedilis-connector.md`](../interface/aedilis-connector.md)）を
手動で確認する。

## 計画（後続）

CLAUDE.md / DESIGN §4 の方針に沿い、優先度順に：

1. **`plugins/data.ts` のクエリ最小ケースを vitest で書く**（最優先。スキーマ正本かつ hub/Bot 共有のため）。
   実 SQLite に対して `ensureSchema` → `createEvent`/`listEvents`/`eventsDueForReminder`、
   `createJob`/`listJobs`（`q`/`category`/`status` フィルタ）/`closeJob`/`jobsDueForReminder` を実走検証する。
   - fake/deps 注入ではなく**実 SQL 経路**を通す（列名・予約語・方言は実 DB でしか出ない、
     [[feedback_fake_dep_tests_miss_real_sql]]）。
2. WAL 共有の冪等初期化（hub 先 / Bot 先のどちらでも `ensureSchema` が安全）を実 2 接続で確認。
3. Discord コマンドハンドラは discord.js のモック境界が重いため、当面は手動で据え置く。

## 関連

- データ: [`data/glab-event.md`](../data/glab-event.md) / [`data/glab-job.md`](../data/glab-job.md)
- 接点: [`interface/corpus-db-shared.md`](../interface/corpus-db-shared.md)
