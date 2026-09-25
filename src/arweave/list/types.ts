export type ArweaveContentItem =
  | { type: 'image'; data: string; alt?: string; mime?: string }
  | {
      type: 'link';
      href: string;
      mime: string;
      label: string;
      arId?: string;
      download?: boolean;
    };

export interface ArweaveListItem {
  id: string;
  address: string;
  timestamp: number;
  /** 区块高度；未确认 / 未知为 0。排序以 height 为主（与 GraphQL HEIGHT_DESC 一致）。 */
  blockHeight: number;
  badgeLabel: string;
  /** 链上 File-Name 标签 */
  fileName: string;
  /** 链上 Note 标签 */
  note: string;
  contentItems: ArweaveContentItem[];
  /** key = 文本里的占位符原文，value = 本机全路径，可直接给 Image */
  cacheMap?: Record<string, string>;
}

export interface ArweaveGraphQLTag {
  name: string;
  value: string;
}

export interface ArweaveGraphQLTransaction {
  id: string;
  block: { timestamp: number; height: number } | null;
  tags: ArweaveGraphQLTag[];
}
