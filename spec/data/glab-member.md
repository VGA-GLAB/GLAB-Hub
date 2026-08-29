# data/ — `glab_member` テーブル

管理者限定の部員名簿をSQLiteに保持する。スキーマとクエリの正本は
[`plugins/data.ts`](../../plugins/data.ts) で、Web hubとDiscord Botが同じWAL DBを共有する。

## データ境界

- Cernere登録前だけ `display_name` を一時保持し、`user_id` へのリンクと同時にNULL化する。
- リンク後の氏名は表示時にCernere `vantan_user` から取得し、GLABへ複製しない。
- `discord_handle` と `discord_user_id` はBot連携用の機能データであり、管理者API以外へ返さない。
- ハンドル変更時は解決済みIDを必ず破棄し、Botは解決開始時と同じハンドルの未解決行だけを更新する。

## カラム

| カラム | 意味 |
|---|---|
| `id` | 名簿行UUID |
| `user_id` | Cernere user ID。未リンク時はNULL、一意 |
| `display_name` | 未リンク期間だけ保持する氏名 |
| `discord_user_id` | Botが解決したDiscord数値ID、一意 |
| `discord_handle` | 管理者が入力したDiscordユーザー名 |
| `status` | `active` / `invited` / `alumni` / `suspended` |
| `club_role` | GLAB内の係 |
| `joined_at` | 名簿追加時刻（epoch ms） |
| `updated_at` | 最終更新時刻（epoch ms） |
| `updated_by` | 更新したCernere user ID |

## 整合性

Cernereリンク先は、GLABへログイン済みで `glab_user` に存在し、かつ他の名簿行へ未リンクの
user IDだけを受け付ける。削除は名簿行と一時保持データを物理削除する。

## 関連

- [`feature/member-roster.md`](../feature/member-roster.md)
- [`interface/corpus-db-shared.md`](../interface/corpus-db-shared.md)
