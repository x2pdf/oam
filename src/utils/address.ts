export const BLACK_HOLE_ADDRESS = '0x0000000000000000000000000000000000000000';

export function isBlackHoleAddress(address: string): boolean {
  return address?.toLowerCase() === BLACK_HOLE_ADDRESS;
}

export function shortenAddress(address: string): string {
  if (!address || address.length <= 12) return address || '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
