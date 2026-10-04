// Odeum チケット署名鍵の公開鍵を `{ kid: PEM }` の JSON で書き出す。
// 中継 (odeum-relay) の `ODEUM_RELAY_TICKET_PUBKEYS` が指すファイルになる。
//
//   (Excubitor の Vault 注入下で) npm run odeum:pubkeys -- --out <path>
//
// 秘密鍵は env (GLAB_ODEUM_TICKET_PRIVATE_KEY / GLAB_ODEUM_TICKET_KID) からだけ読み、
// 出力するのは公開鍵だけ。 --out 省略時は標準出力へ書く。

import { writeFileSync } from 'node:fs';
import { TICKET_KID_ENV, TICKET_PRIVATE_KEY_ENV } from '../plugins/odeum/config.ts';
import { loadTicketSigner, publicKeysDocument } from '../plugins/odeum/ticket.ts';

const pem = process.env[TICKET_PRIVATE_KEY_ENV]?.trim();
const kid = process.env[TICKET_KID_ENV]?.trim();
if (!pem || !kid) {
  console.error(`Missing Excubitor-injected environment: ${[
    pem ? null : TICKET_PRIVATE_KEY_ENV,
    kid ? null : TICKET_KID_ENV,
  ].filter(Boolean).join(', ')}`);
  process.exit(1);
}

const document = `${JSON.stringify(publicKeysDocument(loadTicketSigner(pem, kid)), null, 2)}\n`;
const outIndex = process.argv.indexOf('--out');
const out = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
if (out) {
  writeFileSync(out, document, 'utf8');
  console.log(`wrote odeum ticket public keys (kid ${kid}) to ${out}`);
} else {
  process.stdout.write(document);
}
