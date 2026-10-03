/**
 * Arweave gateway configuration (read data / GraphQL query / post transaction).
 * Source: AR.IO gateway registry (`/ar-io/peers`, 342 registered urls / 93 domains on 2026-10-03)
 * + live probe of each: GET /<txid>, POST /graphql, GET /price/1000 (170 urls / 44 domains passed).
 * Organized: Tier 1 (stable, well-known) → Tier 2 (probed OK, independent operators) → unstable.
 * Only one gateway per operator is listed; the registry has dozens of sibling nodes
 * (g1..g31.vnar.xyz, arA..arM.noddex.com, ...) that share infrastructure and fail together.
 * Every entry also proxies `POST /tx`, so the same list serves uploads.
 */
export const ARWEAVE_GATEWAYS = [
  // ── Tier 1: Verified working (stable, well-known) ──────────────────────
  'https://arweave.net/',
  'https://turbo-gateway.com/',                               // ArDrive Turbo
  'https://ardrive.net/',                                     // ArDrive
  'https://ar-io.dev/',                                       // AR.IO (dev)
  'https://vilenarios.com/',

  // ── Tier 2: Probed OK, independent operators ───────────────────────
  'https://arweave.tokyo/',
  'https://frostor.xyz/',
  'https://derad.network/',
  'https://gatewaypie.com/',
  'https://perma.online/',
  'https://vevivo.art/',
  'https://ario.zigza.xyz/',
  'https://arweave.fllstck.dev/',
  'https://arm.noddex.com/',
  'https://ar.vnnode.com/',
  'https://ara.innostack.xyz/',
  'https://ark.oohgroup.vn/',
  'https://g4.vnar.xyz/',
  'https://gw5.exnihilio.com/',

  // ── Unstable (probe 503 / timeout — may recover) ────────────────────
  'https://permagate.io/',

  // ── Dead (DNS SERVFAIL, 2026-10-03) — kept for reference, do not enable ─
  // 'https://ar-io.net/',
  // 'https://g8way.io/',
] as const;

export const PRIMARY_ARWEAVE_GATEWAY = ARWEAVE_GATEWAYS[0];

/** GraphQL list query: GET/POST per-gateway timeout. */
export const ARWEAVE_GRAPHQL_REQUEST_TIMEOUT_MS = 15000;

/** Price / balance / anchor reads before upload. */
export const ARWEAVE_READ_TIMEOUT_MS = 15000;

/** Posting a signed transaction (may upload several chunks). */
export const ARWEAVE_POST_TIMEOUT_MS = 120000;

/** Serial attempts per operation (each attempt uses the next gateway). Keeps the worst case bounded. */
export const ARWEAVE_MAX_GATEWAY_ATTEMPTS = 6;
