export function formatUploadFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function base64ByteLength(base64: string): number {
  const cleaned = base64.replace(/=+$/, '');
  return Math.floor((cleaned.length * 3) / 4);
}
