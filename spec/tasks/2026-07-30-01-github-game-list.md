# GitHub ゲームリスト・Release 配布

- GitHub public API から公開リポジトリの説明、README、contributors、Release を同期する。
- Release は GLAB SQLite にキャッシュし、最新 asset のダウンロードと Discord 通知を提供する。
- API host は `https://api.github.com` に固定し、`GLAB_GITHUB_TOKEN` は任意の rate-limit 緩和用途だけにする。
- 手動編集済みのプロジェクト説明を同期で上書きしない。
- README・contributors・topics は存在しないことがあるため、欠損しても同期全体を失敗させない。
- 無題 Release (`name` が null) は tag を表示名に使い、未公開 (draft) の Release は取り込まない。
- panel が `<a href>` / `<img src>` に入れる asset URL と avatar URL は https のものだけ受け付ける。
- Discord 通知は同期で新しく現れた Release だけを対象にし、初回同期の既存 Release は通知済み扱いにする。
