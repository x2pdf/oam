/**
 * Ethereum RPC Node Configuration
 * Source: ChainList + manual verification
 * Organized: Tier 1 (top providers) → Tier 2 (reputable) → Tier 3 (smaller) → unstable → dead
 */
export const RPC_NODES = [
  // ── Tier 1: Verified working (fast & reliable) ─────────────────────────
  "https://ethereum.publicnode.com",                          // PublicNode (Geodetic)
  "https://ethereum-rpc.publicnode.com",                      // PublicNode (alt domain)
  "https://eth-mainnet.public.blastapi.io",                   // BlastAPI
  "https://mainnet.gateway.tenderly.co",                      // Tenderly
  "https://gateway.tenderly.co/public/mainnet",               // Tenderly (alt)
  "https://eth.drpc.org",                                     // dRPC
  "https://rpc.mevblocker.io",                                // MEVBlocker (Flashbots)
  "https://rpc.flashbots.net",                                // Flashbots

  // ── Tier 2: Well-known, reputable providers ────────────────────────
  "https://cloudflare-eth.com",                               // Cloudflare
  "https://rpc.ankr.com/eth",                                 // Ankr
  "https://1rpc.io/eth",                                      // Automata 1RPC
  "https://eth-pokt.nodies.app",                              // Pocket Network
  "https://ethereum.public.blockpi.network/v1/rpc/public",    // BlockPI
  "https://eth-mainnet.nodereal.io/v1/1659dfb40aa24bbb8153a677b98064d7", // NodeReal
  "https://public-eth.nownodes.io",                           // Nownodes
  "https://eth.api.onfinality.io/public",                     // OnFinality
  "https://ethereum-mainnet.gateway.tatum.io",                // Tatum
  "https://public.1rpc.io/eth",                               // 1RPC (alt domain)
  "https://eth.rpc.blxrbdn.com",                              // bloXroute
  "https://ethereum-public.nodies.app",                       // Nodies (alt)
  "https://rpc.flashbots.net/fast",                           // Flashbots fast
  "https://rpc.mevblocker.io/fast",                           // MEVBlocker fast
  "https://rpc.mevblocker.io/noreverts",                      // MEVBlocker no-reverts
  "https://rpc.mevblocker.io/fullprivacy",                    // MEVBlocker full-privacy

  // ── Tier 3: Smaller / newer but currently working ──────────────────
  "https://eth.meowrpc.com",
  "https://eth1.lava.build",                                  // Lava Network
  "https://0xrpc.io/eth",
  "https://ethereum-json-rpc.stakely.io",
  "https://rpc-eth.blockmachine.io",
  "https://rpc.nodeflare.app/eth/public",
  "https://rpc.polysplit.cloud/v1/chain/1",
  "https://eth.blockrazor.xyz",
  "https://rpc.swiftnodes.io/rpc/eth",
  "https://rpc.fullsend.to",

  // ── Unstable (521 / 429 — may recover) ──────────────────────────────
  "https://eth.llamarpc.com",
  "https://ethereum.blockpi.network/v1/rpc/public",
  "https://eth.merkle.io",
  "https://endpoints.omniatech.io/v1/eth/mainnet/public",
  "https://lb.routeme.sh/rpc/evm/1",
  "https://rpc.graffiti.farm",
  "https://services.tokenview.io/vipapi/nodeservice/eth?apikey=qVHq2o6jpaakcw3lRstl",
  "https://rpc.eth.gateway.fm",
  "https://api.mycryptoapi.com/eth",

  // ── Dead / Unreachable (000 — connection timeout) ───────────────────
  "https://rpc.payload.de",
  "https://rpc.builder0x69.io",
  "https://virginia.rpc.blxrbdn.com",
  "https://uk.rpc.blxrbdn.com",
  "https://singapore.rpc.blxrbdn.com",
  "https://api.securerpc.com/v1",
  "https://eth-mainnet-public.unifra.io",
  "https://api.zmok.io/mainnet/oaen6dy8ff6hju9k",
  "https://mainnet.eth.cloud.ava.do",
  "https://ethereumnodelight.app.runonflux.io",
  "https://main-light.eth.linkpool.io",
  "https://rpc.notadegen.com/eth",
  "https://eth.nodeconnect.org",
  "https://public.stackup.sh/api/v1/node/ethereum-mainnet",
  "https://rpc.nodifi.ai/api/rpc/free",
  "https://rpc.public.curie.radiumblock.co/http/ethereum",
  "https://ethereum.therpc.io",
  "https://rpc.poolz.finance/eth",
  "https://rpc.blocknative.com/boost",
  "https://eth-mainnet.4everland.org/v1/37fa9972c1b1cd5fab542c7bdd4cde2f",
  "https://rpc-full.tomo.services/v1/ethereum/aql_live_2dba7f55b5cf0f356538a727da2079fe",
  "https://mainnet.rpc.sentio.xyz",
  "https://openapi.bitstack.com/v1/wNFxbiJyQsSeLrX8RRCHi7NpRxrlErZk/DjShIqLishPCTB9HiMkPHXjUM9CNM9Na/ETH/mainnet",
  "https://eth-mainnet.diamondswap.org/rpc",
  "https://api.stateless.solutions/ethereum/v1/demo",
  "https://eth-rpc.keccak.io",
  "https://rpcfree.com/ethereum-rpc",
  "https://rpc.chain49.com/ethereum?api_key=14d1a8b86d8a4b4797938332394203dc",
];

export const DEFAULT_RPC_NODE = RPC_NODES[0];

/** Per-request HTTP/RPC timeout. Covers the RPC round-trip, not block inclusion. */
export const RPC_REQUEST_TIMEOUT_MS = 10000;

/** Full-list retries while no node has accepted the request yet. */
export const MAX_RPC_CYCLES = 2;

/** After the first node accepts a signed tx, broadcast the same raw tx to this many more nodes. */
export const BROADCAST_EXTRA_NODES = 3;

export const ETHEREUM_CHAIN_ID = 1;
