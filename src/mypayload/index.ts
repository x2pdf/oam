import { toUtf8Bytes, toUtf8String } from "ethers";

export type ContentItem =
  | { type: "text"; content: string }
  | { type: "image"; data: string; alt?: string };

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
 * 按照 HTML 语法对内容进行封装，支持文本和多张图片的混合编排。
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
    }
  }
  html += "</html>";
  return toUtf8Bytes(html);
}

/**
 * 应用层内容 profile（OAM HTML）解码器。OAMP PAYLOAD 本身不规定此格式。
 *
 * 解析 <html> 封装的规范数据，提取 <pre> 中的文本和 <img> 中的图片。
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
    // 匹配 <pre> 内容或 <img> 标签整体
    const tagRegex = /<pre>(.*?)<\/pre>|<img\s+([^>]*?)>/gs;
    let match;

    while ((match = tagRegex.exec(html)) !== null) {
      const [_, textContent, imgTagBody] = match;

      if (textContent !== undefined) {
        // 解码文本内容
        items.push({ type: "text", content: unescapeHtml(textContent) });
      } else if (imgTagBody !== undefined) {
        // 从标签体中提取属性
        const srcMatch = imgTagBody.match(/src="([^"]+)"/);
        const altMatch = imgTagBody.match(/alt="([^"]+)"/);

        if (srcMatch) {
          items.push({
            type: "image",
            data: unescapeHtml(srcMatch[1]),
            alt: altMatch ? unescapeHtml(altMatch[1]) : undefined
          });
        }
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
