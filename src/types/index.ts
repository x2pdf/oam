/**
 * Application-wide type definitions
 */

/** 订阅/地址记录 */
export interface Subscription {
  id: string;
  address: string;
  description: string;
}

/** 主页卡片数据 */
export interface InputDataItem {
  id: string;
  name: string;
  address: string;
  description: string;
  balance: string;
  txCount: number;
  lastActive: string;
}

/** 导航路由参数 */
export type RootStackParamList = {
  MainTabs: undefined;
  SubscriptionForm: {
    mode: 'add' | 'edit';
    source: 'subscriptions' | 'profile';
    subscription?: Subscription;
  };
};

export type MainTabParamList = {
  Home: undefined;
  Subscriptions: undefined;
  Profile: undefined;
};
