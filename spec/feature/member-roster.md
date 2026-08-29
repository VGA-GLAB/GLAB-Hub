# feature/ — 部員名簿

GLAB管理者が、Cernere登録前の部員を含む名簿を管理し、登録済みCernereユーザと対応付ける。
一般ユーザには名簿データを返さず、全APIを `requireAdmin` で保護する。

## API

| メソッド・パス | 振る舞い |
|---|---|
| `GET /list` | 名簿一覧。リンク済みの氏名はCernereから取得する |
| `POST /` | 未リンク部員を追加する |
| `PATCH /:id` | 氏名、Discordユーザー名、係、状態を更新する |
| `POST /:id/link` | GLABへログイン済みの未リンクCernereユーザへ対応付け、一時氏名を破棄する |
| `DELETE /:id` | 名簿行を削除する |
| `GET /link-candidates` | `glab_user` のうち未リンクの候補だけを返す |

## Discord ID解決

Botは起動時と10分周期で未解決行を処理する。Discordのユーザー名（旧形式ではdiscriminatorも含む）を
完全一致で照合し、表示名やサーバーニックネームでは照合しない。周期処理は重複起動せず、終了時は
進行中の検索完了を待ってから共有DBを閉じる。個人識別子はログへ出さない。

## データ境界

氏名の正本はCernereであり、GLABが持つ一時氏名はリンク時に破棄する。Discord情報を含む名簿レスポンスは
管理者だけが取得できる。詳細は [`data/glab-member.md`](../data/glab-member.md)。
