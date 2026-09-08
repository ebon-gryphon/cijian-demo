declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BETA_MODEL_API_KEY?: string;
    BETA_MODEL_PROVIDER?: string;
    BETA_MODEL_MODEL?: string;
  }
}
