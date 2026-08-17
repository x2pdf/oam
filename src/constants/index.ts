/** 地址最大长度 */
export const MAX_ADDRESS_LENGTH = 512;

/** 描述最大长度 */
export const MAX_DESCRIPTION_LENGTH = 156;

/** AsyncStorage 存储键 */
export const STORAGE_KEYS = {
  SUBSCRIPTIONS: '@onchaindata_subscriptions',
  PROFILE: '@onchaindata_profile',
  API_KEY: '@onchaindata_api_key',
} as const;

/** 数据源权重 0 --> 1000, 数值越大越优先请求该数据源 */
export const DATA_SOURCE_WEIGHTS = {
  BLOCKSCOUT: 500,
  ETHERSCAN: 100,
} as const;

/** API 配置 */
export const API_CONFIG = {
  ETHERSCAN_API_KEY: '',
  ETHERSCAN_BASE_URL: 'https://api.etherscan.io/v2/api',
};
