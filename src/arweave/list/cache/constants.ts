/** 每个 AR 钱包地址默认最多缓存的上传记录条数 */
export const ARWEAVE_CACHE_DEFAULT_LIMIT = 200;

/** 缓存过期时间（毫秒），超出后会在写入时清理 */
export const ARWEAVE_CACHE_DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const ARWEAVE_CACHE_SETTING_ENABLED = 'cache_enabled';
export const ARWEAVE_CACHE_SETTING_LIMIT = 'default_limit';
export const ARWEAVE_CACHE_SETTING_MAX_AGE_MS = 'max_age_ms';
