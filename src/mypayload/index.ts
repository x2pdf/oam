import { toUtf8Bytes, toUtf8String } from "ethers";
import { isHttpUrl, linkKind, shouldDownload } from "../utils/attachment";

export type ContentItem =
  | { type: "text"; content: string }
  | { type: "image"; data: string; alt?: string }
  | {
      type: "link";
      href: string;
      mime: string;
      label: string;
      arId?: string;
      kind?: "image" | "video";
      download?: boolean;
    };

/**
 * 创建 PNG 图片内容项
 * 自动为原始 base64 编码添加 data:image/png;base64, 前缀
 *
 * @param rawBase64 不带前缀的原始 base64 字符串
 * @param filename 可选的图片名称，将作为 <img> 的 alt 属性存储
 */
export function createPngItem(rawBase64: string, filename?: string): ContentItem {
  return {
    type: "image",
    data: `data:image/png;base64,${rawBase64}`,
    alt: filename
  };
}

/**
 * 创建 JPEG 图片内容项
 * 自动为原始 base64 编码添加 data:image/jpeg;base64, 前缀
 *
 * @param rawBase64 不带前缀的原始 base64 字符串
 * @param filename 可选的图片名称，形如：sunset.jpg/sunset.jpeg，将作为 <img> 的 alt 属性存储
 */
export function createJpegItem(rawBase64: string, filename?: string): ContentItem {
  return {
    type: "image",
    data: `data:image/jpeg;base64,${rawBase64}`,
    alt: filename
  };
}

/**
 * 创建 GIF 图片内容项
 * 自动为原始 base64 编码添加 data:image/gif;base64, 前缀
 *
 * @param rawBase64 不带前缀的原始 base64 字符串
 * @param filename 可选的图片名称，将作为 <img> 的 alt 属性存储
 */
export function createGifItem(rawBase64: string, filename?: string): ContentItem {
  return {
    type: "image",
    data: `data:image/gif;base64,${rawBase64}`,
    alt: filename
  };
}

/**
 * 创建外链 / Arweave 附件（编码为独立 <a> 标签）
 */
export function createLinkItem(opts: {
  href: string;
  mime: string;
  label: string;
  arId?: string;
}): ContentItem {
  const kind = opts.arId ? linkKind(opts.mime) : undefined;
  return {
    type: "link",
    href: opts.href,
    mime: opts.mime,
    label: opts.label,
    arId: opts.arId,
    kind,
    download: shouldDownload(opts.mime) || undefined,
  };
}

/**
 * HTML 转义，防止标签截断和属性注入
 */
function escapeHtml(str: string): string {
  return str.replace(/[&<>\"]/g, (tag) => {
    const chars: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;"
    };
    return chars[tag] || tag;
  });
}

/**
 * HTML 反转义，还原原始数据
 */
function unescapeHtml(str: string): string {
  return str.replace(/&(amp|lt|gt|quot);/g, (entity, tag) => {
    const entities: Record<string, string> = {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\""
    };
    return entities[tag] || entity;
  });
}

/**
 * 应用层内容 profile（OAM HTML），不是 OAMP 信封的一部分。
 * OAMP PAYLOAD 是不透明字节；换编码只升本 profile 或 OAMP VERSION，不改信封字段。
 *
 * 按照 HTML 语法对内容进行封装，支持文本、内嵌图片与独立 <a> 附件。
 * 对正文和属性值进行 HTML 转义以确保安全和完整性。
 *
 * @param items 内容项数组
 * @returns 编码后的 Uint8Array
 */
export function payloadEncode(items: ContentItem[]): Uint8Array {
  let html = "<html>";
  for (const item of items) {
    if (item.type === "text") {
      // 使用 <pre> 标签包裹文本，并对内容进行转义
      html += `<pre>${escapeHtml(item.content)}</pre>`;
    } else if (item.type === "image") {
      // 构建 img 标签，对 src 和 alt 进行转义
      const src = escapeHtml(item.data);
      const altAttr = item.alt ? ` alt="${escapeHtml(item.alt)}"` : "";
      html += `<img src="${src}"${altAttr}>`;
    } else if (item.type === "link") {
      if (!isHttpUrl(item.href)) continue;
      const href = escapeHtml(item.href);
      const mime = escapeHtml(item.mime);
      const label = escapeHtml(item.label);
      let tag = `<a href="${href}" type="${mime}"`;
      if (item.kind) {
        tag += ` data-kind="${item.kind}"`;
      }
      if (item.arId) {
        tag += ` data-ar-id="${escapeHtml(item.arId)}"`;
      }
      if (item.download) {
        tag += " download";
      }
      tag += `>${label}</a>`;
      html += tag;
    }
  }
  html += "</html>";
  return toUtf8Bytes(html);
}

/**
 * 应用层内容 profile（OAM HTML）解码器。OAMP PAYLOAD 本身不规定此格式。
 *
 * 解析 <html> 封装的规范数据，提取 <pre> 文本、<img> 图片和 <a> 附件。
 * 能够正确处理转义后的内容，并兼容未转义的旧数据。
 *
 * @param data 原始字节数据或字符串
 * @returns 解析后的内容项数组
 */
export function payloadDecode(data: Uint8Array | string): ContentItem[] {
  try {
    const html = bytesToUtf8(data);
    if (html == null || html.length === 0) return [];

    if (!html.startsWith("<html>")) {
      return [{ type: "text", content: html }];
    }

    const items: ContentItem[] = [];
    const tagRegex = /<pre>(.*?)<\/pre>|<img\s+([^>]*?)>|<a\s+([^>]*?)>(.*?)<\/a>/gs;
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
      const textContent = match[1];
      const imgTagBody = match[2];
      const aTagBody = match[3];
      const aInner = match[4];

      if (textContent !== undefined) {
        items.push({ type: "text", content: unescapeHtml(textContent) });
      } else if (imgTagBody !== undefined) {
        const srcMatch = imgTagBody.match(/src="([^"]+)"/);
        const altMatch = imgTagBody.match(/alt="([^"]+)"/);

        if (srcMatch) {
          items.push({
            type: "image",
            data: unescapeHtml(srcMatch[1]),
            alt: altMatch ? unescapeHtml(altMatch[1]) : undefined
          });
        }
      } else if (aTagBody !== undefined) {
        const hrefMatch = aTagBody.match(/href="([^"]+)"/);
        if (!hrefMatch) continue;
        const href = unescapeHtml(hrefMatch[1]);
        if (!isHttpUrl(href)) continue;

        const typeMatch = aTagBody.match(/\btype="([^"]+)"/);
        const arIdMatch = aTagBody.match(/data-ar-id="([^"]+)"/);
        const kindMatch = aTagBody.match(/data-kind="([^"]+)"/);
        const mime = typeMatch ? unescapeHtml(typeMatch[1]) : "application/octet-stream";
        const kindRaw = kindMatch ? unescapeHtml(kindMatch[1]) : undefined;
        const kind = kindRaw === "image" || kindRaw === "video" ? kindRaw : undefined;

        items.push({
          type: "link",
          href,
          mime,
          label: unescapeHtml(aInner ?? ""),
          arId: arIdMatch ? unescapeHtml(arIdMatch[1]) : undefined,
          kind,
          download: /\bdownload\b/i.test(aTagBody) || undefined,
        });
      }
    }

    return items;
  } catch (e) {
    console.warn("payloadDecode failed:", e);
    return [];
  }
}

function bytesToUtf8(data: Uint8Array | string): string | null {
  try {
    if (typeof data === "string") return data;
    return toUtf8String(data);
  } catch {
    return null;
  }
}
