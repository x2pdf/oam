/**
 * Ethereum RPC Node Configuration
 */
export const RPC_NODES = [
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
  "https://cloudflare-eth.com",
  "https://eth-mainnet.public.blastapi.io",
  "https://ethereum.publicnode.com",
  "https://1rpc.io/eth",
  "https://eth.drpc.org",
  "https://rpc.payload.de",
  "https://ethereum.blockpi.network/v1/rpc/public",
  "https://eth.merkle.io",
  "https://rpc.mevblocker.io",
  "https://endpoints.omniatech.io/v1/eth/mainnet/public",
];

export const DEFAULT_RPC_NODE = RPC_NODES[0];

/** Per-request HTTP/RPC timeout. Covers the RPC round-trip, not block inclusion. */
export const RPC_REQUEST_TIMEOUT_MS = 10000;

/** Full-list retries while no node has accepted the request yet. */
export const MAX_RPC_CYCLES = 2;

/** After the first node accepts a signed tx, broadcast the same raw tx to this many more nodes. */
export const BROADCAST_EXTRA_NODES = 3;

export const ETHEREUM_CHAIN_ID = 1;
