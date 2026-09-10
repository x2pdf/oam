export type GeneratePdfResult =
  | { kind: 'file'; uri: string }
  | { kind: 'bytes'; bytes: Uint8Array }
  | { kind: 'printed' };

export function buildExportFilename(address: string): string {
  const id = address
    ? `${address.slice(0, 6)}-${address.slice(-4)}`
    : 'unknown';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `oam-export-${id}-${stamp}.pdf`;
}
