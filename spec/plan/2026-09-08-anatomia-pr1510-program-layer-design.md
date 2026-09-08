# GLAB Revisor PR #1510 の Anatomia program layer 設計

## 診断

reviewed head `b7e7f4b1f49fae2e4f01c1397d4dcd01bbbd362a` では `domain.unassignedAnchors=[]` で、business domain 所属はある。
失敗は `.anatomia/layers.json` がなく、program layer rule が空のため `dualLayer.program.unclassifiedAnchors` に9件残ったもの。

| anchor | source | domain | 提案 layer |
|---|---|---|---|
| `35b8aa094a69f237` | `bot/commands/disabled-interaction.ts:14` `replyToDisabledCommand` | discord-bot | presentation |
| `133db2162cd60148` | `bot/commands/registry.ts:10` `registerCommands` | discord-bot | presentation |
| `2ca2ba5792d3afa5` | `bot/commands/registry.ts:20` `sync` | discord-bot | presentation |
| `e7693be01e835f51` | `bot/index.ts:19` `main` | discord-bot | composition |
| `bd449af367aec68d` | `bot/index.ts:34` ClientReady callback | discord-bot | composition |
| `c14de80408b85084` | `bot/index.ts:46` InteractionCreate callback | discord-bot | composition |
| `0f44ef3447c4ad2a` | `tests/discord-input-boundary.test.ts:10` callback | platform-shell | test |
| `12c5e7b71f0ad4b2` | `tests/discord-input-boundary.test.ts:24` callback | platform-shell | test |
| `638cc5058c0e0e51` | `tests/discord-input-boundary.test.ts:33` callback | platform-shell | test |

## 宣言案

組込4層に外側の `composition` と `test` を足し、inner-to-outer order を
`infrastructure, domain, application, presentation, composition, test` とする。これで `bot/index.ts` から commands への依存と、
test から製品コードへの依存が逆向きにならない。rules は上表の4ファイルを exact path で指定する。

ただし Anatomia の分類は anchor 単体でなく `buildModules` が組み立てた directory module 全体に最初の glob 一致を適用する。
exact file rule でも同じ directory module の他 anchor を分類し得るため、全 module の依存辺と rule precedence を確認してから
`.anatomia/layers.json` を実装する。今回は案だけを記録し、設定変更や gate 再実行は行わない。

## 受入条件

- reviewed head と9 anchor の source対応をレビュー証跡に固定する。
- 全 module の分類結果と依存方向を確認し、既存 anchor の unintended reclassification がない。
- 設定適用後の gate で unclassified 0、禁止方向0を別途検証する。

## 参照

- `spec/anatomia-domains.md`
- `spec/domains/discord-bot.domain.json`
- `spec/domains/platform-shell.domain.json`
- `bot/commands/disabled-interaction.ts`
- `bot/commands/registry.ts`
- `bot/index.ts`
- `tests/discord-input-boundary.test.ts`
