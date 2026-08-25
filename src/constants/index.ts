/** 默认链标识（当前仅支持以太坊主网） */
export const DEFAULT_CHAIN = 'ethereum' as const;

/** 地址最大长度 */
export const MAX_ADDRESS_LENGTH = 512;

/** 描述最大长度 */
export const MAX_DESCRIPTION_LENGTH = 156;

/** AsyncStorage 存储键 */
export const STORAGE_KEYS = {
  SUBSCRIPTIONS: '@oam_subscriptions',
  PROFILE: '@oam_profile',
  API_KEY: '@oam_api_key',
  THEME: '@oam_theme',
  FAVORITES: '@oam_favorites',
  DRAFTS: '@oam_drafts',
  LANGUAGE: '@oam_language',
  FONT_SCALE: '@oam_font_scale',
  DATA_SOURCE_WEIGHTS: '@oam_data_source_weights',
} as const;

/** 旧版 OnchainData 存储键，仅用于一次性迁移 */
export const LEGACY_STORAGE_KEYS = {
  SUBSCRIPTIONS: '@onchaindata_subscriptions',
  PROFILE: '@onchaindata_profile',
  API_KEY: '@onchaindata_api_key',
  THEME: '@onchaindata_theme',
  FAVORITES: '@onchaindata_favorites',
  LANGUAGE: '@onchaindata_language',
} as const;

/** 筛选状态持久化键 */
export const FILTER_STATE_KEY = '@oam_filter_state';

/** 单次请求内，遍历所有数据源失败后的最大重试轮数 */
export const MAX_DATA_SOURCE_CYCLES = 3;

/** 单次向数据源请求的交易条数。偏小以避免限流 */
export const DATA_SOURCE_PAGE_SIZE = 20;

/**
 * 广场黑洞地址专用页大小（原始交易条数，过滤无 input 之后更少）。
 * 大于普通页，以提高公开广播命中率；过大易超时/限流。
 */
export const BLACK_HOLE_PAGE_SIZE = 200;

/**
 * 黑洞一页过滤后若仍无可用条目，自动再拉下一页的最多次数。
 * 含首次请求时最多共 1 + N 次。
 */
export const BLACK_HOLE_EMPTY_CONTINUE_PAGES = 3;

/** 数据源权重 0 --> 1000, 数值越大越优先请求该数据源 */
export const DATA_SOURCE_WEIGHTS = {
  ROUTESCAN: 500,
  BLOCKSCOUT: 300,
  ETHERSCAN: 100,
} as const;

/** API 配置 */
export const API_CONFIG = {
  ETHERSCAN_API_KEY: '',
  ETHERSCAN_BASE_URL: 'https://api.etherscan.io/v2/api',
  /** 无 Etherscan Key 时使用的兼容接口，不需要 Key */
  ROUTESCAN_ETHERSCAN_BASE_URL: 'https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api',
};

/** Explorer HTTP timeout; prevents hung Blockscout/Etherscan fetches from pinning sockets. */
export const DATA_SOURCE_REQUEST_TIMEOUT_MS = 15000;

/** Max concurrent address fetches on the square tab (self + subscriptions). */
export const SQUARE_FETCH_CONCURRENCY = 3;
