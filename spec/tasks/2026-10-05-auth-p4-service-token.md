---
task: auth-p4-service-token
project: GLAB
kind: 実装
status: in_review
delegation_run_id: c5acc3f3-a275-4e7c-9537-cbe1920c0aa8
created: 2026-10-05T00:00:00.000Z
source_session: lictor-d0bec05f-3e35-4545-88f8-e3297c79bd86
---
# 認証集約 P4: GLAB の固定トークンを Cernere service token へ載せ替える

参照: actio:1016770d-0509-4004-b77b-bc3423b2479d

## 実装内容

- [x] 受け側: `/external/*` (consult / projects / tech-links) のガードを `requireExternalServiceAuth` に統一し、
  Cernere service token (scope `glab-external:write`、aud = GLAB の storage_slug) と固定トークンを両受理。
- [x] 受け側: service token はサービス用ヘッダ (`X-Glab-Service-Token` / `X-ProjectHub-Service-Token`) の
  `v4.public.` 値だけを検証する。Authorization はユーザ token (Corpus requireAuth) と取り合うため見ない。
- [x] 送り側共通: service token 発行と `exp - 60 秒` キャッシュ (`plugins/cernere-service-token.ts`)、
  発行失敗時だけ固定トークンへ落とす選択 (`plugins/service-credential.ts`)。
- [x] bot → GLAB: target `EducationLab` の service token を `X-Glab-Service-Token` で送る。
- [x] progress → Calliope: target `CALLIOPE_PROJECT_KEY` の service token を Bearer で送る。
- [x] 契約 C-12〜C-16 と述語を作成し、新旧両経路のテストを追加。

## 再利用と影響範囲

- Corpus の user token 検証は Cernere `/api/auth/me` 照会で、公開鍵の取得・キャッシュ経路が無いため
  再利用できない。PASETO v4.public 検証は依存を足さず node:crypto で実装した。
- Cernere `verifyServiceTokenPaseto` / `hasServiceScope` を参照実装として判定を揃えた。
- Corpus 本体 (`corpus/`) は変更しない。

## 新旧両受理の挙動 (受け側 `/external/*`)

| 提示 | 結果 |
|---|---|
| `X-Glab-Service-Token` / `X-ProjectHub-Service-Token` に有効な service token (scope `glab-external:write`) | 通過 (固定トークン未設定でも通る) |
| 同ヘッダの service token が署名不正・期限切れ・aud 違い・kind 違い | 401 `invalid_service_token` (固定トークン照合へは回さない) |
| 同ヘッダの service token に scope が無い | 403 `insufficient_scope` |
| Cernere 公開鍵を取得できない | 503 `service_token_verifier_unavailable` |
| 上記ヘッダか `Authorization: Bearer` の `v4.public.` 以外の値 | 従来どおり `GLAB_PROJECTS_SERVICE_TOKEN` と timing-safe 照合 (一致で通過 / 不一致 401) |
| 何も無い | 固定トークン設定済みなら 401、未設定なら 503 (fail-closed 維持) |

`CERNERE_BASE_URL` 未設定なら検証器を作らず、`v4.public.` 値も固定トークン照合へ回る (= 401)。

## Calliope → GLAB `/external/projects` の現状 (この PR では挙動を変えていない部分)

- Calliope (`src/clients/projecthub.ts`) は `X-ProjectHub-Service-Token: PROJECTHUB_PROJECTS_SERVICE_TOKEN` と、
  任意で `Authorization: Bearer <user token>` を送る。
- 変更前の GLAB は `x-projecthub-service-token` を読んでいなかった。そのため Bearer があれば
  ユーザ token を固定トークンと比べて 401 `invalid_service_token`、Bearer が無ければ手前の Corpus requireAuth が
  401 `unauthorized` を返す。つまり Calliope → `/external/projects` は現状つねに 401 で失敗している。
- 親セッションの契約改定に従い、この PR から `x-projecthub-service-token` も同じ判定で受ける
  (service token か、`GLAB_PROJECTS_SERVICE_TOKEN` と同じ値の固定トークン)。
- Corpus requireAuth は `/api/*` 全体でユーザ token を要求するので、ユーザ token を持たない呼び出し
  (bot・ユーザ不在の Calliope) は GLAB のガードに届く前に 401 になる。これは Corpus 側の課題で、本 PR の範囲外。

## P5 で消す箇所

- `plugins/projects/service-auth.ts:71-74` 固定トークンの照合と `service_token_unconfigured`、`:127` Bearer 互換、`:131-137` `safeEqual`
- `plugins/shared.ts:62-66` `GLAB_PROJECTS_SERVICE_TOKEN` の読み取り (`serviceToken`) と `plugins/projects/index.ts:267` のログ文言
- `plugins/service-credential.ts:18-23` の legacy 分岐と `legacyToken` オプション (`:29`)
- `plugins/progress/connector.ts:57` `CALLIOPE_SERVICE_TOKEN`
- `bot/glab-api.ts:40,50` と `bot/config.ts:34,109` の `glabServiceToken`、`bot/config-store.ts:21,38`、`bot/config-setup.ts:30`
- `spec/setup/environment.md`・`spec/setup/bot-encrypted-config.md`・`spec/interface/*.md` の固定トークン記述

## 運用側で必要な設定

- Cernere `service_scopes`:
  - `EducationLab` (GLAB hub) に `calliope-api:access` (progress → Calliope の送り側)
  - bot が使う project に `glab-external:write`
  - Calliope の project に `glab-external:write` (Calliope → `/external/projects` を service token にする場合)
- Cernere への Calliope 登録と、登録後の catalog `env:` への `CALLIOPE_PROJECT_KEY` 追記。Calliope 側の受理は Calliope の委託で対応する。
- `GLAB_SERVICE_TOKEN_AUDIENCE` は catalog で `educationlab`。Cernere 上の実 storage_slug が違えば直す。
- bot: `CERNERE_BASE_URL` / `CERNERE_PROJECT_CLIENT_ID` / `CERNERE_PROJECT_CLIENT_SECRET` を env で渡す。注入経路は下の「前提未確定」を参照。
- 固定トークン (`GLAB_PROJECTS_SERVICE_TOKEN` / `CALLIOPE_SERVICE_TOKEN`) は P4 の間は残す。

## 受け入れ条件

C-12 decideServiceClaims(claims, audience, scope, now): kind=service・aud 一致・exp 未到来の service token だけを通し、scope 不足は insufficient_scope、それ以外は invalid
C-13 decideServiceAuth(provided, expected, verification): service token の照合結果があればそれだけで 200/401/403/503 を決め、無ければ従来の固定トークン照合 (未設定 503・不一致 401) に進む
C-14 verifyPasetoV4Public(token, keys): 渡した鍵で v4.public 署名が検証できた token だけ claims を返し、改ざん・別鍵・別形式は null
C-15 serviceTokenCacheDeadline(issuedAt, expiresIn): 送り側は service token を exp の 60 秒前までだけキャッシュする
C-16 selectSenderCredential(issued, legacy): 発行成功なら service token、失敗時に限り設定済みの固定トークンへフォールバックし、どちらも無ければ送らない

## 前提未確定

- Bot は Excubitor catalog に無く、Cernere credentials の注入経路が無い。hub と同じ `EducationLab` の
  launch credential を共有すると起動ごとの rotate で hub 側が失効するため、Bot 用 project の登録が別途要る。
- Calliope は Cernere 未登録。`CALLIOPE_PROJECT_KEY` は登録後に catalog へ追記する。
- GLAB の storage_slug は Cernere の導出規則から `educationlab` と判断した (env で上書き可)。

## 検証

- `tests/service-auth.test.ts` / `tests/cernere-service-token.test.ts` /
  `tests/progress-connector-contract.test.ts` ほか関連テストを実行 (pass)。全テスト 382 件中、
  文字列契約テスト 1 件をガード名の変更に合わせて更新した。
- 型検査は変更ファイルに起因するエラーなし (worktree に bot 依存が無いことによる既存エラーは対象外)。
- サービス起動・実機確認はしていない。
