export function buildJwkFilename(address: string): string {
  const prefix = address && address.length >= 8 ? address.slice(0, 8) : 'wallet';
  return `arweave-jwk-${prefix}.json`;
}
