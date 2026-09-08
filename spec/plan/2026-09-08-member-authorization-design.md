# GLAB 部員認可の分離設計

## 決定

Cernere は本人認証、GLAB の `glab_member` は部員資格の正本とする。認証成功だけでは部員向け API を許可しない。
`glab_member.user_id` は DB の `UNIQUE` 制約と link SQL の両方で一人一行を保つ。

| membership | 許可 |
|---|---|
| `active` かつ期限内 | endpoint 固有の admin / owner 条件へ進む |
| `invited` | 初回 profile 以外は拒否。招待確認 API は現存しないため対象外 |
| `suspended` | 管理者の名簿復旧以外は拒否 |
| `alumni` | `GET /api/x/jobs` と末尾 `/` の一覧だけ。`/career` 等へ拡張しない |
| 名簿なし、未 link、期限切れ | 管理者の名簿管理以外は拒否 |

`membership_expires_at INTEGER NULL` を追加し、`NULL` は無期限、現在時刻以前は失効とする。migration は既存行を
`NULL` のまま維持する。管理 API は Unix 時刻の整数、現在より後、定めた上限内を検証する。失効を `status` へ
自動書戻しせず、request ごとに DB で判定する。期限切れの拒否は `alumni` allowlist より優先する。

## 境界と応答

順序は Corpus 本人認証、GLAB membership、endpoint 固有認可とする。GLAB 側に
`resolveGlabMembership(db, userId, now)` と `requireGlabMember(policy)` を置き、plugin ごとの status 解釈をなくす。
401 は本人未認証、403 は `membership_required` / `membership_inactive`、DB 障害は 503 とする。403 と 503 は
`Cache-Control: no-store` を付け、名簿の個人情報を返さない。

plugin route だけでは `/api/hub/data` の集約入口を保護できない。Corpus に、本人認証後の host access-policy hook を
plugin route と hub aggregation へ共通適用する新規契約が必要である。これは現存 API ではなく Corpus 側の依存であり、
GLAB の `corpus/` は直接編集しない。

対象外は login/logout/callback、`/api/me`、manifest/health、初回の
`GET|PUT /api/x/vantan-user/profile`、管理者限定 members API とする。profile 登録で membership は付与しない。
global admin bypass は名簿 bootstrap / 管理 endpoint に限定し、一般部員操作には membership を要求する。

## 更新、分担、受入

status、link、期限の変更は管理者に限る。`updated_by` / `updated_at` とは別に、変更前後、理由、操作者、時刻を
append-only 監査へ残す。GLAB は `plugins/data.ts`、membership policy、route 宣言、403 UI を担当し、Corpus は共通
policy hook を担当する。

- 名簿なし、未 link、`invited`、`suspended`、期限切れは plugin API と hub aggregation の両方で拒否される。
- `active` は個別認可へ進み、`alumni` は明記した求人一覧以外を使えない。
- profile 登録は membership を作成・有効化せず、管理者は不整合時も名簿を修復できる。
- 全 membership 更新に追記型の監査が残る。

## 参照

- `plugins/data.ts`
- `plugins/members/index.ts`
- `plugins/vantan-user/index.ts`
- `spec/data/glab-member.md`
