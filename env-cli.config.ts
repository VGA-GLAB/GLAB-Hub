import type { EnvCliConfig } from "../Cernere/packages/env-cli/src/types.js";

/**
 * GLAB hub の env-cli 設定。
 *
 *   npm run env:setup        Infisical 初回設定 (machine identity を .env.secrets に保存)
 *   npm run env:gen          Infisical から secret を fetch して .env を生成
 *   npm run env:list / set / get / test / initialize
 *
 * 設計ノート（単独起動フォールバック）:
 *   - GLAB hub は Corpus submodule を起動する薄いランチャ (`server.ts`)。
 *     通常運用ではExcubitorがCernere起動credentialを毎回発行し、spawn envへ注入する。
 *     env-cliはExを使わない単独開発時だけ利用する。
 *   - Discord Bot (`bot/`) の token / API キーは別系統 = 暗号化 config
 *     (@ludiars/encrypted-config、 `npm --prefix bot run config-setup`)。 ここには含めない。
 */

const config: EnvCliConfig = {
  name: "GLAB",

  infraKeys: {
    // ─── Corpus listen port (GLAB 既定) ───────────────────────
    CORPUS_PORT: "5187",

    // ─── このサービス自身の public URL (Cernere PASETO audience) ─
    CORPUS_PUBLIC_URL: "http://localhost:5187",

    // ─── Corpus サービス識別 (Cernere project key / マニフェスト) ─
    CORPUS_SERVICE_ID: "glab",
    CORPUS_DISPLAY_NAME: "GLAB",

    // ─── Cernere 認証 ────────────────────────────────────────
    CERNERE_BASE_URL: "",
    CERNERE_PROJECT_CLIENT_ID: "",
    CERNERE_PROJECT_CLIENT_SECRET: "",

    // ─── Admin user IDs (Cernere sub claim をカンマ区切り) ────
    CORPUS_ADMIN_IDS: "",

    // ─── 集約先: 施設予約 = Aedilis（出席状況は GLAB 所有） ───
    AEDILIS_BASE_URL: "",
  },

  secretsPath: ".env.secrets",
  dotenvPath: ".env",

  defaultSiteUrl: "https://app.infisical.com",
  defaultEnvironment: "dev",

  required: {
    production: [
      "CERNERE_BASE_URL",
      "CERNERE_PROJECT_CLIENT_ID",
      "CERNERE_PROJECT_CLIENT_SECRET",
      "CORPUS_PUBLIC_URL",
      "CORPUS_ADMIN_IDS",
    ],
  },
};

export default config;
