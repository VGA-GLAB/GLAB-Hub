# Tendentia 連携 (トレンドタブ)

> 2026-10-14 neco「GLAB に Td を載せる」。モジュール `plugins/tendentia/`。

## 目的

Tendentia (Td) がいろいろなジャンルから集めた流行を、GLab のタブで見られるようにする。
ゲーム制作ラボなので、最初はジャンル「ゲーム」を開く (ゲームのトレンドが無ければ「すべて」)。

## 口

| GLab | 中身 |
|---|---|
| `GET /api/x/tendentia/map` | Td `GET /api/trend-crawler/map` を読み、表示に要る列だけへ射影して返す |
| `GET /api/x/tendentia/entry-points` | `{ publicUrl }` (Td の公開 URL。本人向けのマップを開くリンク) |

- 接続先は `TENDENTIA_URL` (Td collector の provides)、リンクは `TENDENTIA_PUBLIC_URL`。どちらも未設定なら
  タブは未接続表示 (503) で、GLab の起動は止めない。
- Td は閲覧だけなら認証不要 (同じ端末 / 公開 URL)。GLab は利用者の token を Td へ渡さない。
- 応答は `cache-control: private, no-store`。上流は `redirect: error`、10 秒で打ち切る。

## 射影 (map-contract.ts)

- 返す列: `lastCrawledAt` / `busy` / `genres[{genre,label,count}]` / `tiles[{title,subtitle,url,genre,sourceName,rank,movement,interest}]`。
- 返さない列: 興味の設定 (`prefs`・気になる言葉)、`reasons`、`key`、`sourceId`、`metric`。上流の列が増えても素通ししない。
- リンクは http(s) だけ。壊れたタイル・ジャンルは 1 件ずつ捨てる。タイルは最大 800 件。

## やらないこと

- 好みの記録 (`/click`・`/interest`) の中継。Td の本人ログインに閉じた個人データなので、GLab からは書かない。
- トレンドの保存・キャッシュ (正本は Td)。
