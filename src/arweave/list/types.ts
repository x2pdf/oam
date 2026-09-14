export type ArweaveContentItem =
  | { type: 'image'; data: string; alt?: string }
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
  badgeLabel: string;
  contentItems: ArweaveContentItem[];
}

export interface ArweaveGraphQLTag {
  name: string;
  value: string;
}

export interface ArweaveGraphQLTransaction {
  id: string;
  block: { timestamp: number } | null;
  tags: ArweaveGraphQLTag[];
}
