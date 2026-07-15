# interface/ — Volputas 動画レビュー導線

GLAB は Volputas のゲームレビュー・動画レビュー機能を複製せず、Corpus の
`HttpServiceConnector` で Volputas の死活を集約する。Web hub の `volputas` パネルから
Volputas 自身の `/game-reviews/new` または `/video-reviews/new` へ遷移させる。

## 境界

- `VOLPUTAS_URL` は API / health の base URL。Excubitor topology が注入する。
- `VOLPUTAS_WEB_URL` は任意の Web UI base URL。省略時は `VOLPUTAS_URL` と同一 origin とする。
- URL は絶対 HTTP(S) のみ許可し、credential・query・fragment を含む設定は起動時に拒否する。
- ゲームレビューは開発作品・市販作品の両方を対象とし、Volputas の session/impression 形式で投稿する。
- 動画本体は GLAB を経由しない。Volputas が発行する署名 PUT URL へブラウザから直接送る。
- 認証・動画所有権・リアクションの認可は Volputas が正本。GLAB の Cernere token を
  Volputas JWT に読み替えない。別タブで Volputas の既存ログインを行う。

Volputas 未設定時も GLAB は degraded で起動し、パネルは「未接続」を表示する。
設定値が存在するのに不正な場合は silent fallback せず起動を失敗させる。
