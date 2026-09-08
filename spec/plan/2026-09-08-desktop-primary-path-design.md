# Desktop 主経路の設計

## 決定

当面の正本は共有 GLAB Hub の Web UI/API とし、desktop 初期版はその remote origin を表示する薄い shell とする。
Corpus `desktop/src/main.ts` は内蔵 server を起動し localhost を読む scaffold であり、この `startServer()` / stop lifecycle は
共有 Hub shell へ流用しない。実装先は GLAB の専用 `desktop/` package とし、Corpus ひな形から window/security 構成だけを
参考にする。完成済み GLAB desktop があるとは案内しない。

| 境界 | 初期版 |
|---|---|
| session | remote Hub の same-origin `Secure; HttpOnly; SameSite` cookie。renderer へ token を渡さない |
| navigation | 許可した Hub origin と HTTPS のみ。外部 navigation/new-window は OS browser へ |
| 権限 | camera等は既定拒否し、明記した画面だけ都度許可 |
| attendance | 現行 Ostiarius/passkey 契約を使い、旧 auto-attendance を復活させない |
| background agent | 初期版の範囲外。browser cookie をコピーしない |

Electron は `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false` とし、preload API は version と外部 link だけへ
限定する。single-instance lock を取り、二重起動時は既存 window を前面へ戻す。外部 link は allowlist した HTTPS のみを
OS browser へ渡す。

将来の COCOIRU background agent は UI session と別の短命 session、最小 scope、単一 refresh owner、OS credential store
（Windows は DPAPI）を使う。失効・logout・端末紛失時の revoke を独立に扱う。

初期機能は login、部員 dashboard、求人・予定・相談への Web navigation、障害時の browser fallback とする。Pf の体験目標
「部活動を支援する超パワーツール」は、既存機能へ一か所から安全に到達できることから始め、background 自動化は後段に分ける。
初回は署名 installer の手動更新とし、署名鍵の所有・保管、正規配布 URL、checksum、rollback 用前版を release 条件にする。
internal pilot、段階 rollout、主経路案内の順に移行し、それまでは Web を利用者経路とする。

## 受入条件

- shell が local server を起動せず、許可 origin 外への認証情報送信を防ぐ。
- reload/restart 後も server-side session 方針に従い、renderer storage に refresh token がない。
- passkey 出席が desktop でも同じ検証を通り、background agent は UI cookie を参照しない。
- installer 署名、更新失敗時 rollback、Web への復旧導線を検証してから主経路と案内する。
- 二重起動が一 instance に集約され、context isolation / sandbox / navigation 制限を検証する。

## 参照

- `spec/plan/glab-hub-v0.2.md`
- `corpus/desktop/src/main.ts`（外部 submodule。参照のみ）
- `DESIGN.md`
- `spec/feature/attendance.md`
- `plugins/attendance/index.ts`
