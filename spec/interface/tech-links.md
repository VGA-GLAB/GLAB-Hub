# 技術リンク共有インターフェース

GLAB の `tech-links` モジュールは、認証済みユーザが技術情報の URL・要約・メモ・タグを共有するための API である。URL は `http` / `https` に限り、ホスト小文字化、末尾スラッシュ・フラグメント・`utm_*` パラメータの除去を経て保存する。`https://user:pass@host/…` 形式の埋め込み credential は共有ボードに残さないため保存前に落とす。表示名は GLAB に複製せず、Cernere の user id から解決する。

すべての応答は `Cache-Control: private, no-store`。削除は `deleted_at` を設定する論理削除で、一覧・詳細・タグ集計・コメントは削除済みリンクを公開しない。

## パネル API

- `GET /api/x/tech-links/links?tag=&q=&limit=&offset=`: 削除されていないリンクの新着順一覧。`limit` は 1–100 (既定 30)。`q` はタイトル・要約・メモ・URL の部分一致で、`%` `_` `\` は literal として扱う (`ESCAPE '\'`)。
- `GET /api/x/tech-links/links/:id`: 本文、タグ、投稿者表示名を返す。
- `POST /api/x/tech-links/links`: `{ url, title, summary?, memo?, tags? }` を登録する。投稿者は認証 identity。
- `PATCH` / `DELETE /api/x/tech-links/links/:id`: 投稿者本人または admin のみ。`PATCH` はタイトル、要約、メモ、タグを更新する。
- `GET` / `POST /api/x/tech-links/links/:id/comments`: コメントを取得・投稿する。投稿者は認証 identity。
- `GET /api/x/tech-links/tags`: 利用数つきのタグ一覧。

## Memoria outbound API

`POST` および `DELETE /api/x/tech-links/external/links` は、Corpus の通常のユーザ認証に加え `X-Glab-Service-Token`（または Bearer token）で `GLAB_PROJECTS_SERVICE_TOKEN` を検証する。サービス認証だけでは到達できない。

- `POST` body: `{ url, title, summary?, memo?, tags?, sourceRef }`。`postedBy` は受け付けず、`getIdentity()` の `userId` で保存する。同じ `(source='memoria', source_ref, posted_by)` が未削除なら `200 { created: false, id }`、新規は `201 { created: true, id }`。
- `DELETE` body: `{ sourceRef }`。`source='memoria'`、`source_ref`、`posted_by=getIdentity().userId` の三条件で限定して `deleted_at` を設定する。他ユーザの共有をサービス token のみで削除できない。

Memoria の HTML スナップショットや page metadata は送信・保存しない。
