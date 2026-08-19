/** 默认链标识（当前仅支持以太坊主网） */
export const DEFAULT_CHAIN = 'ethereum' as const;

/** 地址最大长度 */
export const MAX_ADDRESS_LENGTH = 512;

/** 描述最大长度 */
export const MAX_DESCRIPTION_LENGTH = 156;

/** AsyncStorage 存储键 */
export const STORAGE_KEYS = {
  SUBSCRIPTIONS: '@onchaindata_subscriptions',
  PROFILE: '@onchaindata_profile',
  API_KEY: '@onchaindata_api_key',
  THEME: '@onchaindata_theme',
} as const;

/** 单次请求内，遍历所有数据源失败后的最大重试轮数 */
export const MAX_DATA_SOURCE_CYCLES = 3;

/** 数据源权重 0 --> 1000, 数值越大越优先请求该数据源 */
export const DATA_SOURCE_WEIGHTS = {
  BLOCKSCOUT: 500,
  ROUTESCAN: 300,
  ETHERSCAN: 100,
} as const;

/** API 配置 */
export const API_CONFIG = {
  ETHERSCAN_API_KEY: '',
  ETHERSCAN_BASE_URL: 'https://api.etherscan.io/v2/api',
  /** 无 Etherscan Key 时使用的兼容接口，不需要 Key */
  ROUTESCAN_ETHERSCAN_BASE_URL: 'https://api.routescan.io/v2/network/mainnet/evm/1/etherscan/api',
};
