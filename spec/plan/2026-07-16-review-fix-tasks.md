# 2026-07-16 実装レビュー指摘対応タスク分解

対象: `agent/glab-hub-integrations` ブランチ。2026-07-16 マルチエージェントレビューの
確認済み指摘への対応。指示 (neco): 1,3,4,5,6,8,10 対応 / 2,7 はレガシー処理ごと削除 /
9 は Web 側求人管理を正しく配線。

## T1. 出席 verify を Aedilis へ中継 (指摘 1+4)

- `plugins/attendance/index.ts`: `POST /checkin` の attestation 検証先を
  Ostiarius `/api/checkin/verify` (存在しない) から Aedilis `/api/checkin/verify` へ変更。
  `authorizedConnectorFetch` でユーザトークンを転送し、Aedilis 側の
  本人性 (`payload.sub === authUserId`)・署名・鮮度・リプレイ検証に乗せる。
- setup で Aedilis connector (`AEDILIS_BASE_URL`) を生成 (register は facility 側と重複するため不可)。
- `spec/feature/attendance.md` の verify 記述を Aedilis に修正。

## T2. プロキシのパスパラメータ encode (指摘 3)

- `plugins/volputas/index.ts`: `:id` を `encodeURIComponent` (GET/PUT 両ルート)。
- `plugins/facility/index.ts`: `facilities/:id`・`reservations/:id` も同様。

## T3. Bot の GLAB_DATABASE_URL 供給 (指摘 5)

- `bot/config-store.ts`: `GLAB_BOT_CONFIG_KEYS` に `GLAB_DATABASE_URL` を追加、
  接続文字列は資格情報を含むため `GLAB_BOT_SECRET_KEYS` にも追加。
- `bot/config-setup.ts`: HINTS 追記。
- `spec/setup/environment.md` の Bot 欄に供給経路 (config-setup) を明記。

## T4. イベント削除の恒久失敗解消 (指摘 6)

- `plugins/events/index.ts` DELETE: Aedilis キャンセルが 404 (予約が既に無い) なら
  成功扱いで続行。その他失敗は従来どおり 502 だが `?force=1` (登録者 or admin =
  既存の削除権限と同一) でローカル削除を強行できる。
- `plugins/events/panel.ts`: 削除失敗時にボタンを「強制削除」へ切替え再試行可能にする。
- `spec/feature/events.md` の削除行を更新。

## T5. ヘルスタイムアウトの分離 (指摘 8)

- `plugins/service-health-connector.ts`: 5 秒 `timedFetch` は `probe()` 専用に戻し、
  `fetch()` は呼び出し側の init/signal をそのまま尊重する素の fetch にする。

## T6. レガシー移行処理の削除 (指摘 2+7、データ不在のため)

- `plugins/events/legacy-migration.ts` を削除。
- `plugins/events/index.ts` / `bot/index.ts` から import・呼び出し・ログを除去。
- `plugins/events/store.ts` の `importLegacy` を削除。
- `spec/data/glab-event.md` の旧データ行を削除。

## T7. Web 側求人管理の再配線 (指摘 9)

- `plugins/jobs/index.ts`: origin/main の glab_job ルート (一覧/投稿/クローズ、
  Bot と SQLite 共有) を復元し、Cernere 就活フォームは `/career` 配下に移設して両立。
- `plugins/jobs/panel.ts`: 本人データ (career) セクション + 求人投稿/一覧/クローズ UI を統合。
- `DESIGN.md` の jobs 行と README の記述を実装に一致させる。

## T8. corpus submodule の dirty 解消 (指摘 10)

- corpus 内の未コミット変更 (composite auth / TokenProvider 等 7 ファイル) を
  `agent/cernere-websocket-auth` にコミットし LUDIARS/Corpus へ branch push。
  (nested `lib/cernere` は package-lock ノイズのみ・gitlink は公開済み bc9bd33 のため対象外)
- GLAB 側 gitlink をコミット済み SHA に更新。

## 検証

- `npm run typecheck` (hub tsconfig + frontend tsconfig)
- `npm --prefix bot run typecheck`
- `npm test` (node --test tests/*.test.ts)
- `npm run build` (corpus web + panels esbuild)
- dev server の起動テストは行わない (harness 禁止事項)。
