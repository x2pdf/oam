import { ContentKind, InputDataItem } from '../types';
import { ContentItem } from '../mypayload';
import { isBlackHoleAddress, shortenAddress } from '../utils/address';
import { isImageMime } from '../utils/attachment';
import { fetchWithTimeout } from '../datasource/fetchWithTimeout';

export interface ExportHtmlContext {
  title: string;
  exportAddress: string;
  generatedAtLabel: string;
  itemCountLabel: string;
  encryptedHint: string;
  kindLabels: Record<ContentKind, string>;
  selfLabel: string;
  blackHoleLabel: string;
  attachmentLabel: string;
  /** lowercase address -> display name (self / black hole / subscription) */
  addressNames: Record<string, string>;
}

const DATA_IMAGE_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }
  if (typeof btoa === 'function') return btoa(binary);
  throw new Error('Base64 encoding is not available');
}

async function urlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(url, {}, 12000);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    if (!mime.startsWith('image/')) return null;
    return `data:${mime};base64,${uint8ToBase64(new Uint8Array(buf))}`;
  } catch {
    return null;
  }
}

function senderLabel(item: InputDataItem, ctx: ExportHtmlContext): string {
  const addr = item.address || '';
  const short = escapeHtml(shortenAddress(addr));
  const name = ctx.addressNames[addr.toLowerCase()];
  if (!name) return short;
  return `${short} (<span class="name">${escapeHtml(name)}</span>)`;
}

async function renderContentItems(items: ContentItem[], ctx: ExportHtmlContext): Promise<string> {
  const parts: string[] = [];
  for (const item of items) {
    if (item.type === 'text') {
      parts.push(`<div class="text">${escapeHtml(item.content)}</div>`);
      continue;
    }
    if (item.type === 'image') {
      const src = DATA_IMAGE_RE.test(item.data) ? item.data : null;
      if (src) {
        const alt = escapeHtml(item.alt || '');
        parts.push(
          `<div class="img-block"><img src="${src}" alt="${alt}" /></div>`,
        );
      } else {
        parts.push(`<div class="text">${escapeHtml(item.data)}</div>`);
      }
      continue;
    }
    if (item.type === 'link') {
      if (isImageMime(item.mime)) {
        const dataUri = await urlToDataUri(item.href);
        if (dataUri) {
          parts.push(
            `<div class="img-block"><img src="${dataUri}" alt="${escapeHtml(item.label || '')}" /></div>`,
          );
          continue;
        }
      }
      const href = escapeHtml(item.href);
      const label = escapeHtml(item.label || ctx.attachmentLabel);
      parts.push(`<div class="link">${escapeHtml(ctx.attachmentLabel)}: <a href="${href}">${label}</a></div>`);
    }
  }
  return parts.join('');
}

async function renderBody(item: InputDataItem, ctx: ExportHtmlContext): Promise<string> {
  const kind = item.contentKind ?? 'RAW';
  if (kind === 'OAMP' && Array.isArray(item.oampItems) && item.oampItems.length > 0) {
    return renderContentItems(item.oampItems, ctx);
  }
  if (kind === 'UTF-8' && item.textContent) {
    return `<div class="text">${escapeHtml(item.textContent)}</div>`;
  }
  const rawHex = item.rawInput || item.description || '';
  const hint =
    kind === 'OAMP_ENCRYPTED'
      ? `<div class="hint">${escapeHtml(ctx.encryptedHint)}</div>`
      : '';
  return `${hint}<div class="hex">${escapeHtml(rawHex)}</div>`;
}

async function renderCard(item: InputDataItem, ctx: ExportHtmlContext): Promise<string> {
  const kind = item.contentKind ?? 'RAW';
  const body = await renderBody(item, ctx);
  return `<article class="card">
  <div class="card-header">
    <div class="addr">${senderLabel(item, ctx)}</div>
    <span class="badge">${escapeHtml(ctx.kindLabels[kind])}</span>
  </div>
  <div class="card-body">${body}</div>
  <div class="time">${escapeHtml(item.lastActive || '')}</div>
</article>`;
}

function buildAddressNames(
  items: InputDataItem[],
  ctx: ExportHtmlContext,
): void {
  for (const item of items) {
    const key = (item.address || '').toLowerCase();
    if (!key || ctx.addressNames[key]) continue;
    if (isBlackHoleAddress(item.address)) {
      ctx.addressNames[key] = ctx.blackHoleLabel;
    }
  }
}

export async function buildExportHtml(
  items: InputDataItem[],
  ctx: ExportHtmlContext,
): Promise<string> {
  buildAddressNames(items, ctx);
  const cards: string[] = [];
  for (const item of items) {
    cards.push(await renderCard(item, ctx));
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(ctx.title)}</title>
<style>
  @page { size: A4; margin: 20mm; }
  html, body {
    margin: 0;
    padding: 0;
    color-scheme: light;
    background: #f5f5f5;
    color: #111;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Noto Sans SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    font-size: 14px;
    line-height: 1.45;
  }
  .wrap { padding: 0 20mm 24px; }
  .header { margin: 0 0 16px; }
  .header h1 { font-size: 18px; margin: 0 0 6px; }
  .meta { color: #666; font-size: 12px; word-break: break-all; }
  .card {
    background: #fff;
    border-radius: 12px;
    padding: 12px 10px;
    margin: 0 0 12px;
    border: 1px solid #e8e8e8;
  }
  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .addr { font-weight: 700; color: #1DA1F2; flex: 1; word-break: break-all; }
  .addr .name { color: #7c4dff; font-weight: 700; }
  .badge {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 700;
    color: #1DA1F2;
    white-space: nowrap;
  }
  .text { white-space: pre-wrap; word-break: break-word; margin-bottom: 4px; }
  .hint { color: #666; font-size: 12px; margin-bottom: 4px; }
  .hex {
    font-family: ui-monospace, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 18px;
    word-break: break-all;
    margin-bottom: 4px;
  }
  .link { font-size: 13px; margin-bottom: 4px; word-break: break-all; }
  .time { text-align: right; font-size: 11px; color: #888; margin-top: 4px; }
  .img-block {
    break-inside: avoid;
    page-break-inside: avoid;
    -webkit-column-break-inside: avoid;
    margin: 8px 0;
    text-align: center;
  }
  .img-block img {
    max-width: 100%;
    max-height: 240mm;
    height: auto;
    object-fit: contain;
    display: block;
    margin: 0 auto;
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="header">
      <h1>${escapeHtml(ctx.title)}</h1>
      <div class="meta">${escapeHtml(ctx.exportAddress)}</div>
      <div class="meta">${escapeHtml(ctx.itemCountLabel)} · ${escapeHtml(ctx.generatedAtLabel)}</div>
    </header>
    ${cards.join('\n')}
  </div>
</body>
</html>`;
}
