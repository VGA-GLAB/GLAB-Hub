# interface/ — Calliope コネクタ（進捗）

進捗（`progress`）モジュールは connector（id `calliope`、`scope: 'multi'`、
`baseUrl = CALLIOPE_BASE_URL`）越しに Calliope の `GET /api/glab/progress` を read するだけの
表示面。エンジンは Calliope 側（Calliope docs/design/glab-pm.md §H4/H5）。sprint health /
burndown / risk / 停滞タスクを GLAB 側で再計算せず、GLAB の DB にキャッシュ保存もしない。

実装: `plugins/progress/connector.ts`（設定）/ `relay.ts`（中継）/ `index.ts`（登録）/
`panel.ts` + `progress-view.ts`（表示）。

パネルは他の GLAB パネルと同じく、描画前に `requireVantanUserRegistration()` で Cernere の
必須プロフィール登録を通す（未登録なら登録フォームを出して進捗は描かない）。

## コネクタ実装（`VersionedHttpServiceConnector`）

GLAB の他コネクタ（Aedilis / Di / Tirocinium / Volputas）と同じ
`plugins/service-health-connector.ts` の `VersionedHttpServiceConnector` を使う。
Corpus 組み込みの `HttpServiceConnector` は**使わない**。理由:

- 組み込み版は **data 取得にも health 用の 5 秒タイムアウトを課す**。`/api/glab/progress` は
  Calliope が GLAB projects レジストリ + Actio tasks + Memoria goal eval へ fan-out して
  合成するため、5 秒で切ると PJ 数に比例して失敗しやすい。
- health に接続先のバージョンを出せる（`healthVersion()`）。

固定ヘッダ対応（`headers` オプション）はこの用途のために追加した。呼び出し側が同名ヘッダを
渡した場合は呼び出し側が勝つので、`proxy()` のダウンストリームトークンを潰さない。

タイムアウトは無制限ではなく、`relay.ts` が呼び出し側の `signal` として 30 秒を渡す
（コネクタは data 取得に独自のタイムアウトを課さず、呼び出し側の `signal` を尊重する）。
health の 5 秒では fan-out を待てないが、無制限だと応答しない Calliope が hub 側の
リクエストを掴んだままになるため。超過は下の「未稼働」と同じ `502 connector_error` に写る。

## 認証方式（他コネクタとの違い）

Aedilis 等は `plugins/shared.ts` の `proxy()` 経由で、ログイン中ユーザの Cernere access token
から接続先向け project token を都度発行して中継する。

Calliope はその方式に乗らない。Calliope の `/api/*` は固定の `CALLIOPE_SERVICE_TOKEN`
（Bearer）でのみ認可され、ユーザ単位のトークン発行機構を持たない
（`Calliope/src/app.ts` の `apiAuth(config.serviceToken)`）。そのため `progress` モジュールは
`proxy()` を使わず、コネクタに固定ヘッダ
`{ authorization: 'Bearer ' + CALLIOPE_SERVICE_TOKEN }` を持たせ、
ルートハンドラから `connector.fetch(path)` を直接呼ぶ。

> 結果として、この経路は**ユーザ単位の認可を持たない**。GLAB hub にログインできる利用者は
> 全員同じ進捗ビューを見る（Corpus の `requireAuth` 配下ではある）。PJ 単位で出し分けたく
> なったら Calliope 側に per-user 認可を足すのが先で、GLAB 側でのフィルタは足さない。

## 環境変数

- `CALLIOPE_BASE_URL` — Calliope のベース URL。未設定・空白のみなら「意図的に未設定」と
  みなし、コネクタが `503 { error: 'connector_unconfigured' }` を返す
  → パネルが「未接続（degraded）」を表示する。health も `degraded`（`down` ではない）。
- `CALLIOPE_SERVICE_TOKEN` — Calliope 側 `CALLIOPE_SERVICE_TOKEN` と同じ値。未設定時は
  Authorization ヘッダを付けずに送る（Calliope 側で `serviceToken` が未設定の場合のみ通る。
  本番では両方設定必須）。

## health

`healthPath: '/health'`。Calliope の `/health` は `/api/*` 認可の対象外
（`Calliope/src/routes/health.ts`）なので token 無しでも到達する。ただし
`VersionedHttpServiceConnector` は固定ヘッダを probe にも付ける（接続先が health まで
固定 Bearer で守る構成でも probe が 401 → 常時 degraded にならないようにするため）。
つまり Calliope へは不要な Authorization も送るが、宛先は `CALLIOPE_BASE_URL` に
限られる。この env を GLAB 外のホストへ向けると service token がそこへ渡るので、
向き先は Ex topology / Infisical 管理下の値だけにする。
`registerConnector()` により、この health は組み込み「🟢 ステータス」タブの
接続サービス一覧（`/api/hub/overview`）に他サービスと並んで出る。GLAB 側に status
プラグインは作らない（`tests/navigation-contract.test.ts` が単一 Status 面を固定している）。

Calliope の `/health` は `{ ok: true, service, port, upstreams, connectorState }` を返し
`version` を含まないため、health 詳細は「バージョン情報なし」と表示される（正常）。

## マッピング（hub ルート → Calliope API）

| hub ルート | Calliope | 用途 |
|---|---|---|
| `GET /api/x/progress/progress` | `GET /api/glab/progress` | PJ ごとの sprint health / burndown / risk / 停滞タスク（クエリ文字列をそのまま転送、`?project_id=` を含む） |

## レスポンスとエラーの写り方

成功時は Calliope の `{ generatedAt, projects: GlabProjectProgress[] }`
（`Calliope/src/sprint/progress.ts`）をそのまま透過する。GLAB は解釈・整形・保存をしない。
`cache-control: private, no-store` だけは常に GLAB 側で強制する。

| 状況 | GLAB が返すもの |
|---|---|
| `CALLIOPE_BASE_URL` 未設定 | `503 { error: 'connector_unconfigured', connector: 'calliope' }` |
| Calliope 未稼働（ECONNREFUSED 等で fetch が throw） | `502 { error: 'connector_error', connector: 'calliope', detail }` |
| Calliope 無応答（30 秒でタイムアウト） | 同上（`detail` が `TimeoutError`） |
| Calliope の上流（glab / actio）未設定 | Calliope の `503 <svc>_unconfigured` / `400 glab_progress_prerequisites_missing` を透過 |
| Calliope の上流失敗 | Calliope の `502` を透過 |

未稼働を 502 に写すのが要点。ここで throw させると Hono が 500 を返し、パネルが
「未接続」と「hub 側の不具合」を区別できなくなる。パネル側は `connectorGuard()` が
503 を「未接続」、それ以外を「取得に失敗 (status)」として表示する。

## 関連

- 設計: `Calliope/docs/design/glab-pm.md` §H4/H5
- タスク: `spec/tasks/2026-07-16-03-progress-panel.md`
- テスト: `tests/progress-connector-contract.test.ts`
- 流用元パターン: [`aedilis-connector.md`](./aedilis-connector.md)（ただし認証方式は異なる、上記参照）
