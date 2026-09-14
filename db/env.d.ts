declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    JOURNAL_IMAGES: R2Bucket;
    DIARY_API_KEY?: string;
    DIARY_TEXT_MODEL?: string;
    DIARY_IMAGE_MODEL?: string;
    BETA_MODEL_API_KEY?: string;
    BETA_MODEL_PROVIDER?: string;
    BETA_MODEL_MODEL?: string;
  }
}
