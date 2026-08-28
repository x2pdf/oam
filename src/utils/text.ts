/**
 * Truncates text for list display based on requirements:
 * If length > 2000 characters, show first 100 and last 100 with "..." in between.
 */
export function truncateListText(text: string | null | undefined): string {
  if (!text) return '';
  if (text.length <= 2000) {
    return text;
  }
  const start = text.slice(0, 100);
  const end = text.slice(-100);
  return `${start}...${end}`;
}
