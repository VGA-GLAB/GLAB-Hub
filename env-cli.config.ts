import type { EnvCliConfig } from "../Cernere/packages/env-cli/src/types.js";

/**
 * GLAB hub の env-cli 設定。
 *
 *   npm run env:setup        Infisical 初回設定 (machine identity を .env.secrets に保存)
 *   npm run env:gen          Infisical から secret を fetch して .env を生成
 *   npm run env:list / set / get / test / initialize
 *
 * 設計ノート:
 *   - GLAB hub は Corpus submodule を起動する薄いランチャ (`server.ts`)。
 *     hub の設定 (Cernere / 集約先サービス URL / admin) は Infisical (env-cli) で運用。
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

    // ─── Admin user IDs (Cernere sub claim をカンマ区切り) ────
    CORPUS_ADMIN_IDS: "",

    // ─── 集約先: 出席 / 施設予約 = Aedilis ────────────────────
    AEDILIS_BASE_URL: "",
  },

  secretsPath: ".env.secrets",
  dotenvPath: ".env",

  defaultSiteUrl: "https://app.infisical.com",
  defaultEnvironment: "dev",

  required: {
    production: ["CERNERE_BASE_URL", "CORPUS_PUBLIC_URL", "CORPUS_ADMIN_IDS"],
  },
};

export default config;
