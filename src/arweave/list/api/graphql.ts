import {
  ARWEAVE_GRAPHQL_ENDPOINTS,
  ARWEAVE_GRAPHQL_PAGE_SIZE,
  ARWEAVE_GRAPHQL_REQUEST_TIMEOUT_MS,
} from '../constants';
import { ArweaveGraphQLTransaction } from '../types';

const OWNER_TRANSACTIONS_QUERY = `
query OwnerTransactions($address: String!, $first: Int!, $after: String) {
  transactions(owners: [$address], first: $first, after: $after, sort: HEIGHT_DESC) {
    pageInfo { hasNextPage }
    edges {
      cursor
      node {
        id
        block { timestamp height }
        tags { name value }
      }
    }
  }
}
`;

export interface FetchOwnerTransactionsOptions {
  after?: string | null;
  first?: number;
}

export interface FetchOwnerTransactionsResult {
  items: ArweaveGraphQLTransaction[];
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GraphQLResponse {
  data?: {
    transactions?: {
      pageInfo?: { hasNextPage?: boolean };
      edges?: Array<{
        cursor?: string;
        node?: ArweaveGraphQLTransaction;
      }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

async function postGraphQL(
  endpoint: string,
  address: string,
  first: number,
  after: string | null,
): Promise<FetchOwnerTransactionsResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ARWEAVE_GRAPHQL_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: OWNER_TRANSACTIONS_QUERY,
        variables: { address, first, after },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`GraphQL HTTP ${response.status}`);
    }

    const json = (await response.json()) as GraphQLResponse;
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).filter(Boolean).join('; ') || 'GraphQL error');
    }

    const transactions = json.data?.transactions;
    const edges = transactions?.edges ?? [];
    const items = edges
      .map((edge) => edge.node)
      .filter((node): node is ArweaveGraphQLTransaction => !!node?.id);

    const lastEdge = edges[edges.length - 1];
    const endCursor = lastEdge?.cursor ?? null;

    return {
      items,
      hasNextPage: transactions?.pageInfo?.hasNextPage ?? false,
      endCursor,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchOwnerTransactions(
  address: string,
  options: FetchOwnerTransactionsOptions = {},
): Promise<FetchOwnerTransactionsResult> {
  const first = options.first ?? ARWEAVE_GRAPHQL_PAGE_SIZE;
  const after = options.after ?? null;

  let lastError: unknown;
  for (const endpoint of ARWEAVE_GRAPHQL_ENDPOINTS) {
    try {
      return await postGraphQL(endpoint, address, first, after);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
