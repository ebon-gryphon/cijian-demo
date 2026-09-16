declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    JOURNAL_IMAGES: R2Bucket;
    DIARY_API_KEY?: string;
    DIARY_API_BASE_URL?: string;
    DIARY_TEXT_MODEL?: string;
    DIARY_IMAGE_MODEL?: string;
    DIARY_API_PROTOCOL?: string;
    DIARY_IMAGE_API_PROTOCOL?: string;
    DIARY_IMAGE_API_KEY?: string;
    DIARY_IMAGE_API_BASE_URL?: string;
    DIARY_ALLOWED_API_BASES?: string;
  }
}
